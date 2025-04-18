'use client';

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { MCPServer } from '@/types';
import { Button, Form, Input, Modal, Space, Table, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

interface ServerFormValues {
  name: string;
  url?: string;
  command?: string;
  args?: string;
  env?: string;
}

const McpServerManager: React.FC = () => {
  const { mcpServers, addMcpServer, removeMcpServer } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm<ServerFormValues>();

  const handleAdd = async (values: ServerFormValues) => {
    console.log('开始添加服务器，表单数据：', values);
    try {
      // 处理环境变量
      let envVars: Record<string, string> = {};
      if (values.env) {
        try {
          console.log('解析环境变量：', values.env);
          const parsedEnv = JSON.parse(values.env);
          if (typeof parsedEnv !== 'object' || Array.isArray(parsedEnv)) {
            throw new Error('环境变量必须是一个对象');
          }
          envVars = parsedEnv;
          console.log('环境变量解析成功：', envVars);
        } catch (error) {
          console.error('环境变量解析失败：', error);
          message.error('环境变量格式错误，请输入有效的 JSON 对象');
          return;
        }
      }

      // 处理参数
      console.log('处理命令参数：', values.args);
      const args = values.args ? values.args.split(/\s+/).filter(Boolean) : [];
      console.log('解析后的命令参数：', args);

      const serverData: Omit<MCPServer, 'id' | 'createdAt'> = {
        name: values.name,
        url: values.url,
        command: values.command,
        env: envVars,
        args,
        transportType: values.url ? 'http' : 'stdio',
      };
      console.log('准备提交的服务器数据：', serverData);

      const result = await addMcpServer(serverData);
      console.log('添加服务器结果：', result);
      if (result.success) {
        message.success('服务器添加成功');
        setIsModalOpen(false);
        form.resetFields();
      } else {
        console.error('添加服务器失败：', result.message);
        message.error(result.message || '添加服务器失败');
      }
    } catch (error) {
      console.error('添加服务器异常：', error);
      message.error('添加服务器时发生错误：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleRemove = (serverId: string) => {
    console.log('开始移除服务器，ID：', serverId);
    try {
      removeMcpServer(serverId);
      console.log('服务器移除成功');
      message.success('服务器已移除');
    } catch (error) {
      console.error('移除服务器失败：', error);
      message.error('移除服务器时发生错误：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
    },
    {
      title: '命令',
      dataIndex: 'command',
      key: 'command',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: MCPServer) => (
        <Space>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRemove(record.id)}
          >
            移除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsModalOpen(true)}
        >
          添加服务器
        </Button>
      </div>

      <Table
        dataSource={mcpServers}
        columns={columns}
        rowKey="id"
        pagination={false}
      />

      <Modal
        title="添加服务器"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAdd}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="请输入服务器名称" />
          </Form.Item>

          <Form.Item
            name="url"
            label="URL"
            rules={[{ required: true, message: '请输入服务器URL' }]}
          >
            <Input placeholder="请输入服务器URL" />
          </Form.Item>

          <Form.Item
            name="command"
            label="命令"
            rules={[{ required: true, message: '请输入启动命令' }]}
          >
            <Input placeholder="请输入启动命令" />
          </Form.Item>

          <Form.Item
            name="args"
            label="参数"
            help="多个参数请用空格分隔"
          >
            <Input placeholder="请输入命令参数（可选）" />
          </Form.Item>

          <Form.Item
            name="env"
            label="环境变量"
            help="请输入有效的 JSON 对象，例如：{'KEY': 'VALUE'}"
          >
            <Input.TextArea 
              placeholder='{"KEY": "VALUE", "DEBUG": "true"}' 
              rows={4}
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default McpServerManager; 