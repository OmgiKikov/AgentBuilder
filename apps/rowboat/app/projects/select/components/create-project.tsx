"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createProject, createProjectFromPrompt } from "@/app/actions/project_actions"
import { useRouter } from "next/navigation"
import { starting_copilot_prompts } from "@/app/lib/project_templates"
import { Button } from "@/components/ui/button"
import { FolderOpenIcon, SendIcon, BotIcon, SparklesIcon, LightbulbIcon } from "lucide-react"
import { USE_MULTIPLE_PROJECTS } from "@/app/lib/feature_flags"
import { HorizontalDivider } from "@/components/ui/horizontal-divider"
import Image from "next/image"
import clsx from "clsx"

// Define a type for the prompts dictionary
type PromptDict = { [key: string]: string }

// Filter and slice example prompts
const examplePrompts: PromptDict = Object.entries(starting_copilot_prompts)
  .filter(([name]) => name !== "Blank Template")
  .slice(0, 3) // Take first 3 examples
  .reduce((acc, [name, prompt]) => {
    acc[name] = prompt
    return acc
  }, {} as PromptDict)

interface CreateProjectProps {
  defaultName: string
  onOpenProjectPane: () => void
  isProjectPaneOpen: boolean
}

export function CreateProject({ defaultName, onOpenProjectPane, isProjectPaneOpen }: CreateProjectProps) {
  const [customPrompt, setCustomPrompt] = useState("")
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  // Animation on initial load
  useEffect(() => {
    setIsLoaded(true)
  }, [])

  const handleExampleSelect = (examplePrompt: string) => {
    setCustomPrompt(examplePrompt || "")
    document.getElementById("prompt-textarea")?.focus()
  }

  async function handleSubmit(formData: FormData) {
    try {
      setIsSubmitting(true)
      const projectName = defaultName
      const promptContent = customPrompt.trim()

      let response

      if (promptContent) {
        const promptFormData = new FormData()
        promptFormData.append("name", projectName)
        promptFormData.append("prompt", promptContent)
        response = await createProjectFromPrompt(promptFormData)

        if (response?.id) {
          localStorage.setItem(`project_prompt_${response.id}`, promptContent)
        }
      } else {
        const blankFormData = new FormData()
        blankFormData.append("name", projectName)
        blankFormData.append("template", "default")
        response = await createProject(blankFormData)
      }

      if (!response?.id) {
        console.error("Project creation failed")
        throw new Error("Project creation failed")
      }

      router.push(`/projects/${response.id}/workflow`)
    } catch (error) {
      console.error("Error creating project:", error)
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "TEXTAREA" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(new FormData())
    }
  }

  return (
    <div className="flex h-full min-h-0 box-border overflow-x-hidden">
      {/* Left Column: Content */}
      <div
        className={clsx(
          "flex-1 flex flex-col h-full min-h-0",
          "transition-opacity duration-500 ease-out",
          isLoaded ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Header (Fixed Height) */}
        <header className="p-4 shrink-0">
          {USE_MULTIPLE_PROJECTS && (
            <div className="flex justify-between items-center">
              <div className="flex space-x-4">
                <Button
                  onClick={() => {
                    document.getElementById("prompt-textarea")?.focus();
                  }}
                  variant="primary"
                  size="md"
                  className={clsx(
                    "flex items-center gap-2",
                    "transition-all duration-300",
                    "hover:scale-105 active:scale-95",
                  )}
                >
                  <BotIcon className="w-4 h-4" />
                  Создайте AI-агента
                </Button>
                
                <Button
                  onClick={() => {
                    const blankFormData = new FormData();
                    blankFormData.append("name", defaultName);
                    blankFormData.append("template", "default");
                    createProject(blankFormData);
                  }}
                  variant="secondary"
                  size="md"
                  className={clsx(
                    "flex items-center gap-2",
                    "transition-all duration-300",
                    "hover:scale-105 active:scale-95",
                  )}
                >
                  <SparklesIcon className="w-4 h-4" />
                  Начнем с нуля
                </Button>
              </div>
              
              {!isProjectPaneOpen && (
                <Button
                  onClick={onOpenProjectPane}
                  variant="primary"
                  size="md"
                  className={clsx(
                    "flex items-center gap-2",
                    "transition-all duration-300",
                    "hover:scale-105 active:scale-95",
                  )}
                >
                  <FolderOpenIcon className="w-4 h-4" />
                  Мои агенты
                </Button>
              )}
            </div>
          )}
          {!USE_MULTIPLE_PROJECTS && (
            <div className="flex space-x-4 justify-center">
              <Button
                onClick={() => {
                  document.getElementById("prompt-textarea")?.focus();
                }}
                variant="primary"
                size="md"
                className={clsx(
                  "flex items-center gap-2",
                  "transition-all duration-300",
                  "hover:scale-105 active:scale-95",
                )}
              >
                <BotIcon className="w-4 h-4" />
                Создайте AI-агента
              </Button>
              
              <Button
                onClick={() => {
                  const blankFormData = new FormData();
                  blankFormData.append("name", defaultName);
                  blankFormData.append("template", "default");
                  createProject(blankFormData);
                }}
                variant="secondary"
                size="md"
                className={clsx(
                  "flex items-center gap-2",
                  "transition-all duration-300",
                  "hover:scale-105 active:scale-95",
                )}
              >
                <SparklesIcon className="w-4 h-4" />
                Начнем с нуля
              </Button>
            </div>
          )}
          {isProjectPaneOpen && <HorizontalDivider className="mt-2" />}
        </header>

        {/* Main Scrollable Content */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4">
          <div
            className={clsx(
              "flex flex-wrap gap-2",
              "transition-all duration-700 ease-out delay-100",
              isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
            )}
          >
            {Object.entries(examplePrompts).map(([name, prompt], index) => (
              <button
                key={name}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  handleExampleSelect(prompt)
                }}
                className={clsx(
                  "px-4 py-1.5",
                  "border border-gray-300 dark:border-gray-600",
                  "rounded-full",
                  "text-sm text-gray-600 dark:text-gray-300",
                  "bg-transparent",
                  "hover:bg-gray-100 dark:hover:bg-gray-700/50",
                  "hover:border-gray-400 dark:hover:border-gray-500",
                  "hover:scale-105",
                  "focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:focus:ring-indigo-400/30",
                  "transition-all duration-300",
                  "active:scale-95",
                  "transition-all duration-500 ease-out"
                )}
                style={{
                  transitionDelay: `${150 + index * 75}ms`,
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </main>

        {/* Footer (Form - Fixed Height) */}
        <footer className={clsx(
          "p-4 shrink-0 border-t border-gray-200 dark:border-gray-700",
          "transition-all duration-700 ease-out delay-300",
          isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        )}>
          <form
            id="create-project-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit(new FormData())
            }}
            onKeyDown={handleKeyDown}
          >
            <div
              className={clsx(
                "relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden",
                "transition-all duration-300",
                "hover:border-gray-300 dark:hover:border-gray-600",
                "focus-within:border-indigo-400 dark:focus-within:border-indigo-500",
                "focus-within:ring-1 focus-within:ring-indigo-500/20 dark:focus-within:ring-indigo-400/20",
              )}
            >
              <div className="p-3 pb-14">
                <textarea
                  id="prompt-textarea"
                  name="prompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="✏️ Опишите, какие задачи должен выполнять ваш AI-агент..."
                  className="w-full resize-none bg-transparent border-0 focus:ring-0 focus:outline-none text-base text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  style={{ minHeight: "60px" }}
                  rows={2}
                />
              </div>
              <div className="absolute bottom-3 right-3">
                <button
                  type="submit"
                  disabled={!customPrompt.trim() || isSubmitting}
                  className={clsx(
                    "p-2 rounded-full",
                    "bg-gray-900 dark:bg-gray-700",
                    "hover:bg-gray-800 dark:hover:bg-gray-600",
                    "transition-all duration-300",
                    "hover:scale-110 active:scale-95",
                    "disabled:hover:scale-100",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    customPrompt.trim() ? "opacity-100" : "opacity-40",
                    isSubmitting && "animate-pulse",
                  )}
                >
                  <SendIcon
                    className={clsx(
                      "w-5 h-5 text-white",
                      "transition-transform duration-300",
                      isSubmitting ? "animate-spin" : "group-hover:translate-x-0.5",
                    )}
                  />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-800/90 to-transparent pointer-events-none"></div>
            </div>
          </form>
        </footer>
      </div>

      {/* Right Column: Redesigned with modern UI and updated text */}
      <div
        className={clsx(
          "w-1/2 relative hidden md:block h-full overflow-y-auto",
          "transition-opacity duration-700 ease-out delay-300",
          isLoaded ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Modern gradient background with animation */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          {/* Animated decorative elements */}
          <div
            className={clsx(
              "absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl",
              "animate-pulse-slow",
            )}
            style={{ animationDuration: "8s" }}
          ></div>
          <div
            className={clsx(
              "absolute bottom-1/3 right-1/3 w-72 h-72 rounded-full bg-blue-200/30 dark:bg-blue-900/20 blur-3xl",
              "animate-pulse-slow",
            )}
            style={{ animationDuration: "12s", animationDelay: "2s" }}
          ></div>
        </div>

        {/* Content container */}
        <div className="relative z-10 h-full flex flex-col justify-between p-8">
          {/* Top section with illustration and welcome text */}
          <div
            className={clsx(
              "flex flex-col items-center justify-center pt-12",
              "transition-all duration-1000 ease-out delay-500",
              isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
            )}
          >
            <div
              className={clsx(
                "relative w-48 h-48 mb-6",
                "transition-transform duration-1000 ease-out",
                isLoaded ? "scale-100" : "scale-90",
                "hover:scale-105 transition-transform duration-500",
              )}
            >
              <Image
                src="/placeholder.svg?height=192&width=192"
                alt="AI Agent Builder"
                width={192}
                height={192}
                className="object-contain"
              />
            </div>
            <div className="text-center space-y-2 max-w-md">
              <h2
                className={clsx(
                  "text-2xl font-bold text-gray-800 dark:text-gray-100",
                  "transition-all duration-700 ease-out delay-600",
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
                )}
              >
                Платформа для создания AI-агентов
              </h2>
              <p
                className={clsx(
                  "text-gray-600 dark:text-gray-300",
                  "transition-all duration-700 ease-out delay-700",
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
                )}
              >
                Создавайте персонализированных AI-агентов без навыков программирования
              </p>
            </div>
          </div>

          {/* Feature cards */}
          <div className="space-y-3 mt-auto">
            {[
              {
                icon: <BotIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
                bgColor: "bg-purple-100 dark:bg-purple-900/30",
                title: "Персонализированные агенты",
                description: "Создавайте агентов для любых задач — от анализа данных до автоматизации",
                delay: 800,
              },
              {
                icon: <SparklesIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
                bgColor: "bg-blue-100 dark:bg-blue-900/30",
                title: "Простота использования",
                description: "Просто опишите задачи, и платформа создаст агента за считанные минуты",
                delay: 900,
              },
              {
                icon: <LightbulbIcon className="w-4 h-4 text-green-600 dark:text-green-400" />,
                bgColor: "bg-green-100 dark:bg-green-900/30",
                title: "Начните прямо сейчас",
                description: "Опишите задачи вашего агента в поле слева и создайте своего первого AI-помощника",
                delay: 1000,
              },
            ].map((feature, index) => (
              <div
                key={index}
                className={clsx(
                  "bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-3 border border-gray-200 dark:border-gray-700 shadow-sm",
                  "transition-all duration-500 ease-out",
                  "hover:border-gray-300 dark:hover:border-gray-600",
                  "hover:shadow-md hover:translate-y-[-2px]",
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
                )}
                style={{
                  transitionDelay: `${feature.delay}ms`,
                  transitionDuration: `${500 + index * 100}ms`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={clsx(
                      "p-1.5 rounded-full",
                      feature.bgColor,
                      "transition-transform duration-300 ease-out",
                      "group-hover:scale-110",
                    )}
                  >
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{feature.title}</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
