import asyncio
import json
import logging
import os
import shutil
from contextlib import AsyncExitStack
from typing import Any, AsyncGenerator, Optional, Union

import httpx
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client
# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

class ServerType:
    STDIO = "stdio"
    SSE = "sse"

class Configuration:
    """Manages configuration and environment variables for the MCP client."""

    def __init__(self) -> None:
        """Initialize configuration with environment variables."""
        self.load_env()
        self.api_key = os.getenv("LLM_API_KEY")
        self.llm_base_url = os.getenv("LLM_BASE_URL")
        self.llm_model = os.getenv("LLM_MODEL")
        self.temperature = os.getenv("LLM_TEMPERATURE")


    @staticmethod
    def load_env() -> None:
        """Load environment variables from .env file."""
        load_dotenv()

    @staticmethod
    def load_config(file_path: str) -> dict[str, Any]:
        """Load server configuration from JSON file.

        Args:
            file_path: Path to the JSON configuration file.

        Returns:
            Dict containing server configuration.

        Raises:
            FileNotFoundError: If configuration file doesn't exist.
            JSONDecodeError: If configuration file is invalid JSON.
        """
        with open(file_path, "r") as f:
            return json.load(f)

    @property
    def llm_api_key(self) -> str:
        """Get the LLM API key.

        Returns:
            The API key as a string.

        Raises:
            ValueError: If the API key is not found in environment variables.
        """
        if not self.api_key:
            raise ValueError("LLM_API_KEY not found in environment variables")
        return self.api_key

class Tool:
    """Represents a tool with its properties and formatting."""

    def __init__(
        self, name: str, description: str, input_schema: dict[str, Any]
    ) -> None:
        self.name: str = name
        self.description: str = description
        self.input_schema: dict[str, Any] = input_schema

    def format_for_llm(self) -> str:
        """Format tool information for LLM.

        Returns:
            A formatted string describing the tool.
        """
        args_desc = []
        if "properties" in self.input_schema:
            for param_name, param_info in self.input_schema["properties"].items():
                arg_desc = (
                    f"- {param_name}: {param_info.get('description', 'No description')}"
                )
                if param_name in self.input_schema.get("required", []):
                    arg_desc += " (required)"
                args_desc.append(arg_desc)

        return f"""
Tool: {self.name}
Description: {self.description}
Arguments:
{chr(10).join(args_desc)}
"""

class Server:
    """Manages MCP server connections and tool execution."""

    def __init__(self, name: str, config: dict[str, Any]) -> None:
        self.name: str = name
        self.config: dict[str, Any] = config
        self.stdio_context: Any | None = None
        self.session: ClientSession | None = None
        self._cleanup_lock: asyncio.Lock = asyncio.Lock()
        self.exit_stack: AsyncExitStack = AsyncExitStack()

    async def initialize(self) -> None:
        """Initialize the server connection."""
        command = (
            shutil.which("npx")
            if self.config["command"] == "npx"
            else self.config["command"]
        )
        if command is None:
            raise ValueError("The command must be a valid string and cannot be None.")

        server_params = StdioServerParameters(
            command=command,
            args=self.config["args"],
            env={**os.environ, **self.config["env"]}
            if self.config.get("env")
            else None,
        )
        try:
            stdio_transport = await self.exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            read, write = stdio_transport
            session = await self.exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            self.session = session
        except Exception as e:
            logging.error(f"Error initializing server {self.name}: {e}")
            await self.cleanup()
            raise

    async def list_tools(self) -> list[Any]:
        """List available tools from the server.

        Returns:
            A list of available tools.

        Raises:
            RuntimeError: If the server is not initialized.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        tools_response = await self.session.list_tools()
        tools = []

        for item in tools_response:
            if isinstance(item, tuple) and item[0] == "tools":
                for tool in item[1]:
                    tools.append(Tool(tool.name, tool.description, tool.inputSchema))

        return tools

    async def execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        retries: int = 2,
        delay: float = 1.0,
    ) -> Any:
        """Execute a tool with retry mechanism.

        Args:
            tool_name: Name of the tool to execute.
            arguments: Tool arguments.
            retries: Number of retry attempts.
            delay: Delay between retries in seconds.

        Returns:
            Tool execution result.

        Raises:
            RuntimeError: If server is not initialized.
            Exception: If tool execution fails after all retries.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        attempt = 0
        while attempt < retries:
            try:
                # logging.info(f"Executing {tool_name}...")
                result = await self.session.call_tool(tool_name, arguments)
                return result

            except Exception as e:
                attempt += 1
                logging.warning(
                    f"Error executing tool: {e}. Attempt {attempt} of {retries}."
                )
                if attempt < retries:
                    logging.info(f"Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                else:
                    logging.error("Max retries reached. Failing.")
                    raise

    async def cleanup(self) -> None:
        """Clean up server resources."""
        async with self._cleanup_lock:
            try:
                await self.exit_stack.aclose()
                self.session = None
                self.stdio_context = None
            except Exception as e:
                logging.error(f"Error during cleanup of server {self.name}: {e}")

class SSEServer:
    """Manages SSE-based MCP server connections and tool execution."""

    def __init__(self, name: str, config: dict[str, Any]) -> None:
        self.name: str = name
        self.config: dict[str, Any] = config
        self.url: str = config["url"]
        self.session: Optional[ClientSession] = None
        self.tools: list[Tool] = []
        self._cleanup_lock: asyncio.Lock = asyncio.Lock()
        self.exit_stack: AsyncExitStack = AsyncExitStack()

    async def initialize(self) -> None:
        """Initialize the SSE server connection."""
        max_retries = 3
        retry_delay = 2.0
        
        for attempt in range(max_retries):
            try:
                logging.info(f"Initializing SSE server {self.name} with url: {self.url} (Attempt {attempt + 1}/{max_retries})")
                
                transport = await self.exit_stack.enter_async_context(
                    sse_client(
                        self.url, 
                        headers=self.config.get("headers", {}),
                        timeout=httpx.Timeout(60.0)  # 增加超时时间
                    )
                )
                read, write = transport
                session = await self.exit_stack.enter_async_context(
                    ClientSession(read, write)
                )
                await session.initialize()
                self.session = session
                
                # 获取工具列表
                tools_response = await self.session.list_tools()
                logging.info(f"Raw tools response: {tools_response}")
                
                self.tools = []
                for item in tools_response:
                    if isinstance(item, tuple) and len(item) >= 2:
                        if item[0] == "tools" and isinstance(item[1], list):
                            for tool in item[1]:
                                try:
                                    tool_obj = Tool(
                                        name=tool.name,
                                        description=tool.description,
                                        input_schema=tool.inputSchema
                                    )
                                    self.tools.append(tool_obj)
                                    logging.info(f"Added tool: {tool_obj.name}")
                                except Exception as e:
                                    logging.error(f"Error processing tool: {e}")
                        else:
                            logging.warning(f"Unexpected item format: {item}")
                    else:
                        logging.warning(f"Invalid item structure: {item}")
                
                logging.info(f"Total tools found for {self.name}: {len(self.tools)}")
                return  # 成功则直接返回
                
            except Exception as e:
                logging.error(f"Error initializing SSE server {self.name} (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (attempt + 1))
                    continue
                await self.cleanup()
                raise

    async def list_tools(self) -> list[Tool]:
        """List available tools from the server."""
        if not self.session:
            raise RuntimeError(f"SSE Server {self.name} not initialized")
        return self.tools

    async def execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        retries: int = 3,  # 增加重试次数
        delay: float = 2.0,
    ) -> Any:
        """Execute a tool with retry mechanism."""
        if not self.session:
            logging.error(f"SSE Server {self.name} not initialized")
            await self.initialize()  # 尝试重新初始化
        
        attempt = 0
        while attempt < retries:
            try:
                logging.info(f"Executing tool {tool_name} on SSE server {self.name} (Attempt {attempt + 1}/{retries})")
                result = await self.session.call_tool(tool_name, arguments)
                return result
            except Exception as e:
                attempt += 1
                logging.error(f"Error executing tool: {str(e)}. Stack trace: {e.__traceback__}")
                if attempt < retries:
                    await asyncio.sleep(delay * (attempt + 1))
                    # 如果是连接相关错误，尝试重新初始化
                    if "connection" in str(e).lower():
                        try:
                            await self.initialize()
                        except Exception as re_init_error:
                            logging.error(f"Failed to reinitialize: {re_init_error}")
                else:
                    raise

    async def cleanup(self) -> None:
        """Clean up server resources."""
        async with self._cleanup_lock:
            try:
                await self.exit_stack.aclose()
                self.session = None
                logging.info(f"Cleaned up SSE server {self.name}")
            except Exception as e:
                logging.error(f"Error during cleanup of server {self.name}: {e}")

    async def keep_alive(self) -> None:
        """保持SSE连接活跃的心跳检测"""
        while True:
            try:
                if self.session:
                    # 发送一个简单的ping请求
                    await self.session.call_tool("ping", {})
                await asyncio.sleep(30)  # 每30秒发送一次心跳
            except Exception as e:
                logging.warning(f"Heart beat failed: {e}")
                try:
                    await self.initialize()  # 尝试重新初始化连接
                except Exception as re_init_error:
                    logging.error(f"Failed to reinitialize connection: {re_init_error}")
class LLMClient:
    """Manages communication with the LLM provider."""

    def __init__(self, api_key: str) -> None:
        self.api_key: str = api_key
        self.llm_base_url = os.getenv("LLM_BASE_URL")
        self.llm_model = os.getenv("LLM_MODEL")
        self.temperature = os.getenv("LLM_TEMPERATURE")

    def get_response(self, messages: list[dict[str, str]]) -> str:
        """Get a response from the LLM.

        Args:
            messages: A list of message dictionaries.

        Returns:
            The LLM's response as a string.

        Raises:
            httpx.RequestError: If the request to the LLM fails.
        """
        url = self.llm_base_url

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "messages": messages,
            "model": self.llm_model,
            "temperature": 0,
            "max_tokens": 4096,
            "stream": False
        }

        try:
            timeout = httpx.Timeout(30.0, connect=30.0)
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]

        except httpx.RequestError as e:
            error_message = f"Error getting LLM response: {str(e)}"
            logging.error(error_message)

            if isinstance(e, httpx.HTTPStatusError):
                status_code = e.response.status_code
                logging.error(f"Status code: {status_code}")
                logging.error(f"Response details: {e.response.text}")

            return (
                f"I encountered an error: {error_message}. "
                "Please try again or rephrase your request."
            )
    
    async def get_stream_response(self, messages: list[dict[str, str]]) -> AsyncGenerator[str, None]:
        """Get a stream of responses from the LLM.

        Args:
            messages: A list of message dictionaries.   

        Returns:
            An async generator of LLM responses.

        Raises:
            httpx.RequestError: If the request to the LLM fails.
        """
        url = self.llm_base_url
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "messages": messages,
            "model": self.llm_model,
            "temperature": 0,
            "max_tokens": 4096,
            "stream": True  # 启用流式
        }

        timeout = httpx.Timeout(30.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_lines():
                        if chunk.strip().startswith("data: "):
                            json_str = chunk.strip()[6:]
                            if json_str == "[DONE]":
                                break
                            try:
                                data = json.loads(json_str)
                                if "content" in data["choices"][0]["delta"]:
                                    yield data["choices"][0]["delta"]["content"]
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                logging.error(f"Stream error: {str(e)}")
                yield f"[流式响应错误: {str(e)}]"

class ChatSession:
    """Orchestrates the interaction between user, LLM, and tools."""

    def __init__(self, servers: list[Union[Server, SSEServer]], llm_client: LLMClient) -> None:
        self.servers: list[Union[Server, SSEServer]] = servers
        self.llm_client: LLMClient = llm_client

    async def cleanup_servers(self) -> None:
        """Clean up all servers properly."""
        cleanup_tasks = []
        for server in self.servers:
            cleanup_tasks.append(asyncio.create_task(server.cleanup()))

        if cleanup_tasks:
            try:
                await asyncio.gather(*cleanup_tasks, return_exceptions=True)
            except Exception as e:
                logging.warning(f"Warning during final cleanup: {e}")

    async def process_llm_response(self, llm_response: str) -> AsyncGenerator[str, None]:
        """Process the LLM response and execute tools if needed."""
        try:
            tool_call = json.loads(llm_response)
            if "tool" in tool_call and "arguments" in tool_call:
                print(f"Executing tool: {tool_call['tool']} With arguments: {tool_call['arguments']}")
                yield f"Executing tool: {tool_call['tool']} With arguments: {tool_call['arguments']}"
                
                found = False
                for server in self.servers:
                    tools = await server.list_tools()
                    if any(tool.name == tool_call["tool"] for tool in tools):
                        try:
                            result = await server.execute_tool(
                                tool_call["tool"], 
                                tool_call["arguments"]
                            )
                            if isinstance(result, dict) and "progress" in result:
                                progress = result["progress"]
                                total = result["total"]
                                percentage = (progress / total) * 100
                                print(f"Progress: {progress}/{total} ({percentage:.1f}%)")
                                yield f"Progress: {progress}/{total} ({percentage:.1f}%)"
                            print(f"Tool execution result: {result}")
                            yield f"Tool execution result: {result}"
                            found = True
                        except Exception as e:
                            error_msg = f"Error executing tool: {str(e)}"
                            logging.error(error_msg)
                            yield error_msg
                if not found:
                    yield f"No server found with tool: {tool_call['tool']}"
            else:
                yield llm_response
        except json.JSONDecodeError:
            yield llm_response

    async def start(self) -> AsyncGenerator[str, None]:
        """Main chat session handler."""
        try:
            for server in self.servers:
                try:
                    await server.initialize()
                except Exception as e:
                    logging.error(f"Failed to initialize server: {e}")
                    await self.cleanup_servers()
                    return

            all_tools = []
            for server in self.servers:
                tools = await server.list_tools()
                all_tools.extend(tools)

            tools_description = "\n".join([tool.format_for_llm() for tool in all_tools])

            system_message = (
                "You are a helpful assistant with access to these tools:\n\n"
                f"{tools_description}\n"
                "Choose the appropriate tool based on the user's question. "
                "If no tool is needed, reply directly.\n\n"
                "IMPORTANT: When you need to use a tool, you must ONLY respond with "
                "the exact JSON object format below, nothing else, 不能有前缀和后缀:\n"
                "{\n"
                '    "tool": "tool-name",\n'
                '    "arguments": {\n'
                '        "argument-name": "value"\n'
                "    }\n"
                "}\n\n"
                "After receiving a tool's response:\n"
                "1. Transform the raw data into a natural, conversational response\n"
                "2. Keep responses concise but informative\n"
                "3. Focus on the most relevant information\n"
                "4. Use appropriate context from the user's question\n"
                "5. Avoid simply repeating the raw data\n"
                "6. When all tasks are completed, end your response with '[TASK_COMPLETE]'\n"
                "7. If there are follow-up tasks, use '接下来' to indicate them\n\n"
                "Please use only the tools that are explicitly defined above."
            )

            messages = [{"role": "system", "content": system_message}]
            # print(f"messages: {messages}")
            
            while True:
                try:
                    user_input = input("You: ").strip().lower()
                    if user_input in ["quit", "exit"]:
                        logging.info("\nExiting...")
                        break

                    messages.append({"role": "user", "content": user_input})
                    final_response = []
                    full_response = []
                    
                    while True:
                        full_response = []
                        
                        async for chunk in self.llm_client.get_stream_response(messages):
                            full_response.append(chunk)
                        llm_response = "".join(full_response)
                        # print(f"\n\ntool call: {llm_response}")
                        # yield llm_response

                        processed_chunks = []
                        async for chunk in self.process_llm_response(llm_response):
                            processed_chunks.append(chunk)
                            yield chunk
                        result = "".join(processed_chunks)

                        if result != llm_response:
                            messages.append({"role": "assistant", "content": llm_response})
                            messages.append({"role": "system", "content": result})
                            
                            async for chunk in self.llm_client.get_stream_response(messages):
                                final_response.append(chunk)
                                print(f"chunk: {chunk}")
                                yield chunk

                            final_response_text = "".join(final_response)
                            # print(f"final_response: {final_response_text}")
                            
                            # 检查是否任务完成
                            if "[TASK_COMPLETE]" in final_response_text:
                                clean_response = final_response_text.replace("[TASK_COMPLETE]", "").strip()
                                messages.append({"role": "assistant", "content": clean_response})
                                break
                            
                            # 处理后续任务 
                            else:
                                messages.append({"role": "assistant", "content": final_response_text})
                            
                        else:
                            if "[TASK_COMPLETE]" in llm_response:
                                clean_response = llm_response.replace("[TASK_COMPLETE]", "").strip()
                                messages.append({"role": "assistant", "content": clean_response})
                                break
                            messages.append({"role": "assistant", "content": llm_response})
                            if "接下来" not in llm_response:
                                break
                        
                        # print(f"message: {messages}")

                except KeyboardInterrupt:
                    logging.info("\nExiting...")
                    break

        finally:
            await self.cleanup_servers()

def create_server(name: str, config: dict[str, Any]) -> Union[Server, SSEServer]:
    """Factory function to create appropriate server instance based on configuration content."""
    # 通过配置内容判断服务器类型
    # 如果配置中包含 base_url，则认为是 SSE 服务器
    # 如果配置中包含 command，则认为是 STDIO 服务器
    if "url" in config:
        return SSEServer(name, config)
    elif "command" in config:
        return Server(name, config)
    else:
        raise ValueError(f"Invalid server configuration for {name}: must contain either 'url' for SSE or 'command' for STDIO")

async def main() -> None:
    """Initialize and run the chat session."""
    config = Configuration()
    server_config = config.load_config("servers_config.json")
    servers = [
        create_server(name, srv_config)
        for name, srv_config in server_config["mcpServers"].items()
    ]
    llm_client = LLMClient(config.llm_api_key)
    chat_session = ChatSession(servers, llm_client)
    async for response in chat_session.start():
        print()
        # print("ll:" + response, end="", flush=True)


if __name__ == "__main__":
    asyncio.run(main())