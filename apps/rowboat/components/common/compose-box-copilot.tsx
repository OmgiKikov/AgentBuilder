'use client';

import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AudioInputButton } from "./audio-input-button";

// Add a type to support both message formats
type FlexibleMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | any;
    version?: string;
    chatId?: string;
    createdAt?: string;
    // Add any other optional fields that might be needed
};

interface IconProps {
    size: number;
    className?: string;
}

interface ComposeBoxCopilotProps {
    handleUserMessage: (message: string) => void;
    messages: any[];
    loading: boolean;
    initialFocus?: boolean;
    shouldAutoFocus?: boolean;
    onFocus?: () => void;
    onCancel?: () => void;
}

export function ComposeBoxCopilot({
    handleUserMessage,
    messages,
    loading,
    initialFocus = false,
    shouldAutoFocus = false,
    onFocus,
    onCancel,
}: ComposeBoxCopilotProps) {
    const [input, setInput] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const previousMessagesLength = useRef(messages.length);

    // Handle initial focus
    useEffect(() => {
        if (initialFocus && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [initialFocus]);

    // Handle auto-focus when new messages arrive
    useEffect(() => {
        if (shouldAutoFocus && messages.length > previousMessagesLength.current && textareaRef.current) {
            textareaRef.current.focus();
        }
        previousMessagesLength.current = messages.length;
    }, [messages.length, shouldAutoFocus]);

    function handleInput() {
        const prompt = input.trim();
        if (!prompt) {
            return;
        }
        setInput('');
        handleUserMessage(prompt);
    }

    function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleInput();
        }
    }

    const handleFocus = () => {
        setIsFocused(true);
        onFocus?.();
    };

    function handleAudioText(text: string) {
        if (text.trim()) {
            setInput(text);
            // Если нужно автоматически отправлять распознанный текст, раскомментируйте следующую строку
            // handleUserMessage(text);
        }
    }

    return (
        <div className="relative group">
            {/* Keyboard shortcut hint */}
            <div className="absolute -top-6 right-0 text-xs text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Нажмите ⌘ + Enter для отправки сообщения или используйте голосовой ввод */}
            </div>

            {/* Новый современный контейнер */}
            <div className="flex items-center gap-3 min-h-[52px] p-3 rounded-2xl border border-gray-200 dark:border-[#2a2d31] bg-white dark:bg-[#1e2023]">
                {/* Микрофон */}
                <AudioInputButton onTextReceived={handleAudioText} disabled={loading} />

                {/* Текстовое поле */}
                <div className="flex-1">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        onFocus={handleFocus}
                        onBlur={() => setIsFocused(false)}
                        disabled={loading}
                        placeholder="Введите сообщение..."
                        autoResize={true}
                        maxHeight={120}
                        className={`!min-h-0 !border-0 !shadow-none !ring-0 bg-transparent resize-none overflow-y-auto text-base placeholder:text-gray-500 dark:placeholder:text-gray-400`}
                    />
                </div>

                {/* Кнопка отправки или стоп */}
                <button
                    type="button"
                    disabled={!loading && !input.trim()}
                    onClick={loading ? onCancel : handleInput}
                    className={`w-10 h-10 min-w-0 min-h-0 p-0 rounded-full flex items-center justify-center border border-gray-200 dark:border-[#2a2d31] bg-white dark:bg-[#23262b] shadow-sm transition
                        ${loading 
                            ? 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30' 
                            : input.trim() 
                                ? 'text-indigo-500 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30' 
                                : 'text-gray-400 dark:text-gray-500'}
                        active:scale-95 disabled:opacity-50`}
                >
                    {loading ? (
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                    ) : (
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
                    )}
                </button>
            </div>
        </div>
    );
}

// Custom SendIcon component for better visual alignment
function SendIcon({ size, className }: IconProps) {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={className}
        >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
    );
}

// Custom StopIcon component for better visual alignment
function StopIcon({ size, className }: IconProps) {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="currentColor" 
            stroke="none"
            className={className}
        >
            <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
    );
}
