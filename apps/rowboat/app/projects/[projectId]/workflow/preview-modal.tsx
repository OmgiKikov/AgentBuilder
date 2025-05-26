import { createContext, useContext, useEffect, useState } from "react";
import clsx from "clsx";
import MarkdownContent from "../../../lib/components/markdown-content";
import React, { PureComponent } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { XIcon } from "lucide-react";
import { Button } from "@heroui/react";

// Create the context type
export type PreviewModalContextType = {
    showPreview: (
        oldValue: string | undefined,
        newValue: string,
        markdown: boolean,
        title: string,
        message?: string,
        onApply?: () => void
    ) => void;
};

// Create the context
export const PreviewModalContext = createContext<PreviewModalContextType>({
    showPreview: () => { }
});

// Export the hook for easy usage
export const usePreviewModal = () => useContext(PreviewModalContext);

// Create the provider component
export function PreviewModalProvider({ children }: { children: React.ReactNode }) {
    const [modalProps, setModalProps] = useState<{
        oldValue?: string;
        newValue: string;
        markdown: boolean;
        title: string;
        message?: string;
        onApply?: () => void;
        isOpen: boolean;
    }>({
        newValue: '',
        markdown: false,
        title: '',
        isOpen: false
    });

    // Handle Esc key
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setModalProps(prev => ({ ...prev, isOpen: false }));
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // Update the showPreview function
    const showPreview = (
        oldValue: string | undefined,
        newValue: string,
        markdown: boolean,
        title: string,
        message?: string,
        onApply?: () => void
    ) => {
        setModalProps({ oldValue, newValue, markdown, title, message, onApply, isOpen: true });
    };

    return (
        <PreviewModalContext.Provider value={{ showPreview }}>
            {children}
            {modalProps.isOpen && (
                <PreviewModal
                    {...modalProps}
                    onClose={() => setModalProps(prev => ({ ...prev, isOpen: false }))}
                />
            )}
        </PreviewModalContext.Provider>
    );
}

// The modal component
function PreviewModal({
    oldValue = undefined,
    newValue,
    markdown = false,
    title,
    message,
    onApply,
    onClose,
}: {
    oldValue?: string | undefined;
    newValue: string;
    markdown?: boolean;
    title: string;
    message?: string;
    onApply?: () => void;
    onClose: () => void;
}) {
    const buttonLabel = oldValue === undefined ? 'Preview' : 'Diff';
    const [view, setView] = useState<'preview' | 'markdown'>('preview');
    console.log(oldValue, newValue);

    return <div className="fixed left-0 top-0 w-full h-full bg-gray-500/50 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white rounded-md p-2 flex flex-col w-[90%] gap-4 h-[90%] max-w-7xl max-h-[800px]">
            <button className="self-end text-gray-500 hover:text-gray-700 flex items-center gap-1"
                onClick={onClose}
            >
                <XIcon className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-2">
                    <div className="text-md font-semibold">{title}</div>
                    {message && <div className="text-sm text-gray-600">{message}</div>}
                </div>
                {onApply && <Button
                    variant="solid"
                    color="primary"
                    onPress={() => {
                        onApply();
                        onClose();
                    }}
                >
                    Применить изменения
                </Button>}
            </div>
            <div className="bg-gray-100 rounded-md p-2 flex flex-col overflow-auto">
                <div className="flex items-center gap-2 justify-end">
                    <div className="flex items-center">
                        <button className={clsx("text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded-t-md", {
                            'bg-white': view === 'preview',
                        })} onClick={() => setView('preview')}>{buttonLabel === 'Preview' ? 'Предпросмотр' : 'Сравнение'}</button>
                        {markdown && <button className={clsx("text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded-t-md", {
                            'bg-white': view === 'markdown',
                        })} onClick={() => setView('markdown')}>Markdown</button>}
                    </div>
                </div>
                <div className="bg-white rounded-md grow overflow-auto">
                    <div className="h-full flex flex-col overflow-auto">
                        {view === 'preview' && <div className="flex gap-1 overflow-auto text-sm">
                            {oldValue !== undefined && <ReactDiffViewer
                                oldValue={oldValue}
                                newValue={newValue}
                                splitView={true}
                                compareMethod={DiffMethod.WORDS_WITH_SPACE}
                            />}
                            {oldValue === undefined && <pre className="p-2 overflow-auto">{newValue}</pre>}
                        </div>}
                        {view === 'markdown' && <div className="flex gap-1">
                            {oldValue !== undefined && <div className="w-1/2 flex flex-col border-r-2 border-gray-200 overflow-auto">
                                <div className="text-gray-800 font-semibold italic text-sm px-2 py-1 border-b-1 border-gray-200">Старое</div>
                                <div className="p-2 overflow-auto">
                                    <MarkdownContent
                                        content={oldValue}
                                    />
                                </div>
                            </div>}
                            <div className={clsx("flex flex-col", {
                                'w-1/2': oldValue !== undefined
                            })}>
                                {oldValue !== undefined && <div className="text-gray-800 font-semibold italic text-sm px-2 py-1 border-b-1 border-gray-200">Новое</div>}
                                <div className="p-2 overflow-auto">
                                    <MarkdownContent
                                        content={newValue}
                                    />
                                </div>
                            </div>
                        </div>}
                    </div>
                </div>
            </div>
        </div>
    </div>;
} 