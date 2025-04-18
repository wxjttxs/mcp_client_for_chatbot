'use client';

import React, { useState, useEffect } from 'react';
import styles from '../styles/ChatMessage.module.css';

interface TypewriterProps {
  content: string;
  isTyping: boolean;
  onComplete?: () => void;
  typingSpeed?: number;
}

export const Typewriter: React.FC<TypewriterProps> = ({
  content,
  isTyping,
  onComplete,
  typingSpeed = 30
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isTyping) {
      setDisplayedContent(content);
      setCurrentIndex(content.length);
      onComplete?.();
      return;
    }

    if (currentIndex < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(prev => prev + 1);
      }, typingSpeed);

      return () => clearTimeout(timeout);
    } else if (currentIndex === content.length) {
      onComplete?.();
    }
  }, [content, currentIndex, isTyping, onComplete, typingSpeed]);

  useEffect(() => {
    if (content !== displayedContent && !isTyping) {
      setDisplayedContent(content);
      setCurrentIndex(content.length);
    }
  }, [content, displayedContent, isTyping]);

  return (
    <div className={styles.text}>
      {displayedContent.split('\n').map((line, index) => (
        <React.Fragment key={index}>
          {line || ' '}
          {index < displayedContent.split('\n').length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
}; 