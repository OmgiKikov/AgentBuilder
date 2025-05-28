import { Button } from "@heroui/react";
import { HelpCircle, BookOpen, MessageCircle } from "lucide-react";

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartTour: () => void;
}

export function HelpModal({ isOpen, onClose, onStartTour }: HelpModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg p-6 w-[480px] max-w-[90vw] animate-in fade-in duration-200">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                    Нужна помощь?
                </h2>
                <div className="space-y-4">
                    <Button
                        className="w-full justify-start gap-4 text-left py-6 px-4 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all duration-200 group hover:scale-[1.02] hover:shadow-md"
                        variant="light"
                        onPress={onStartTour}
                    >
                        <div className="bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-500/30 transition-colors">
                            <HelpCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <div className="font-medium text-base text-gray-900 dark:text-gray-100">Пройти тур по продукту</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Изучите возможности AgentBuilder
                            </div>
                        </div>
                    </Button>

                    <a 
                        href="https://docs.AgentBuilderlabs.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                    >
                        <Button
                            className="w-full justify-start gap-4 text-left py-6 px-4 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all duration-200 group hover:scale-[1.02] hover:shadow-md"
                            variant="light"
                        >
                            <div className="bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-500/30 transition-colors">
                                <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <div className="font-medium text-base text-gray-900 dark:text-gray-100">Документация</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    Ознакомьтесь с подробными руководствами
                                </div>
                            </div>
                        </Button>
                    </a>

                    <a 
                        href="mailto:johnkikov01@gmail.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                    >
                        <Button
                            className="w-full justify-start gap-4 text-left py-6 px-4 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all duration-200 group hover:scale-[1.02] hover:shadow-md"
                            variant="light"
                        >
                            <div className="bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg group-hover:bg-indigo-200 dark:group-hover:bg-indigo-500/30 transition-colors">
                                <MessageCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>   
                                <div className="font-medium text-base text-gray-900 dark:text-gray-100">Связаться с нами</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    Получите помощь от нашей команды
                                </div>
                            </div>
                        </Button>
                    </a>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
} 