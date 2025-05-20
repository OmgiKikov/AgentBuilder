"use client";

import { SendIcon } from "lucide-react";
import clsx from "clsx";
import type React from "react";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit: () => void;
  minHeight?: string;
  rows?: number;
}

export function PromptInput({
  value,
  onChange,
  placeholder,
  onSubmit,
  minHeight = "80px",
  rows = 3,
}: PromptInputProps) {
  const handleTextareaChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    onChange(e.target.value);
    // Basic auto-resize logic (can be enhanced)
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit();
      }
    }
  };

  const isDisabled = !value.trim();

  return (
    <div className="relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden w-full">
      <div className="p-3 pb-14">
        <textarea
          id="prompt-textarea-component" // Changed id to avoid potential conflicts
          name="prompt"
          value={value}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Введите ваш запрос..."}
          className="w-full resize-none bg-transparent border-0 focus:ring-0 focus:outline-none text-base text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          style={{ minHeight: minHeight }}
          rows={rows}
        />
      </div>

      <div className="absolute bottom-3 right-3">
        <button
          type="submit" // Ensures it can submit the parent form
          onClick={(e) => { // Added onClick to prevent default if it's also a submit button
            if (isDisabled) {
              e.preventDefault(); // Prevent submission if disabled
            } else {
              onSubmit(); // Call onSubmit if not disabled
            }
          }}
          className={clsx(
            "p-2 rounded-full",
            "bg-gray-900 dark:bg-gray-700",
            "hover:bg-gray-800 dark:hover:bg-gray-600",
            "transition-colors duration-200",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            isDisabled ? "opacity-40" : "opacity-100",
          )}
          disabled={isDisabled}
        >
          <SendIcon className="w-5 h-5 text-white" />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-800/90 to-transparent pointer-events-none"></div>
    </div>
  );
} 