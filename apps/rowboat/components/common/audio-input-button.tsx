'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface AudioInputButtonProps {
  onTextReceived: (text: string) => void;
  disabled?: boolean;
}

export function AudioInputButton({ onTextReceived, disabled = false }: AudioInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  
  // Функция для начала записи
  const startRecording = async () => {
    try {
      // Запрашиваем доступ к микрофону
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Создаем MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Настраиваем обработчик событий для получения данных
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Настраиваем обработчик события остановки записи
      mediaRecorder.onstop = handleRecordingStop;
      
      // Начинаем запись
      mediaRecorder.start();
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (error) {
      console.error('Ошибка при запуске записи:', error);
      alert('Не удалось получить доступ к микрофону. Пожалуйста, проверьте настройки разрешений.');
    }
  };
  
  // Функция для остановки записи
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Останавливаем все треки медиапотока
      mediaRecorderRef.current.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setIsRecording(false);
    }
  };
  
  // Обработка остановки записи
  const handleRecordingStop = async () => {
    const recordingDuration = Date.now() - recordingStartTimeRef.current;
    
    // Проверяем, длилась ли запись больше 2 секунд
    if (recordingDuration < 2000) {
      console.log('Запись слишком короткая (менее 2 секунд)');
      return;
    }
    
    try {
      setIsProcessing(true);
      console.log('Начало обработки аудио');
      
      // Создаем WAV-файл из записанных данных
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      console.log(`Создан Blob аудио, размер: ${audioBlob.size} байт, тип: ${audioBlob.type}`);
      
      // Создаем FormData для отправки на сервер
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      console.log('FormData подготовлен для отправки');
      
      // Получаем API-ключ из переменных окружения
      const apiKey = typeof window !== 'undefined' ? 
        (window as any).__NEXT_DATA__?.props?.pageProps?.apiKey || '' : '';
      console.log('API ключ получен');
      
      // Отправляем запрос к API
      console.log('Отправка запроса к /api/transcribe_audio');
      const response = await fetch('/api/transcribe_audio', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      console.log(`Получен ответ от сервера, статус: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Ошибка сервера: ${response.status}`, errorText);
        throw new Error(`Ошибка сервера: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Данные от сервера:', data);
      
      if (data.transcription) {
        console.log(`Получена транскрипция: "${data.transcription}"`);
        onTextReceived(data.transcription);
      } else if (data.error) {
        console.error(`Сервер вернул ошибку: ${data.error}`);
        alert(`Ошибка распознавания: ${data.error}`);
      } else {
        console.error('Сервер не вернул транскрипцию');
        alert('Не удалось распознать речь. Пожалуйста, попробуйте еще раз.');
      }
    } catch (error) {
      console.error('Ошибка при обработке аудио:', error);
      alert('Не удалось распознать речь. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsProcessing(false);
      console.log('Обработка аудио завершена');
    }
  };
  
  // Обработка нажатия на кнопку (нажатие и удерживание)
  const handleButtonMouseDown = () => {
    if (!disabled && !isProcessing) {
      startRecording();
    }
  };
  
  const handleButtonMouseUp = () => {
    if (isRecording) {
      stopRecording();
    }
  };
  
  // Очистка при размонтировании компонента
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [isRecording]);
  
  return (
    <Button
      size="sm"
      variant="tertiary"
      className={`
        p-2 min-w-8 h-8
        transition-all duration-200
        ${isRecording 
          ? 'bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/50 dark:hover:bg-red-800/60 dark:text-red-300' 
          : isProcessing
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/60 dark:text-indigo-300'
        }
        scale-100 hover:scale-105 active:scale-95
        disabled:opacity-50 disabled:scale-95
        hover:shadow-md dark:hover:shadow-indigo-950/10
        mb-0.5
      `}
      disabled={disabled || isProcessing}
      onMouseDown={handleButtonMouseDown}
      onMouseUp={handleButtonMouseUp}
      onMouseLeave={isRecording ? handleButtonMouseUp : undefined}
      onTouchStart={handleButtonMouseDown}
      onTouchEnd={handleButtonMouseUp}
    >
      {isProcessing ? (
        <LoadingSpinner size={16} className="animate-spin" />
      ) : (
        <MicrophoneIcon 
          size={16} 
          className={`transform transition-all ${isRecording ? 'scale-110 text-red-600 dark:text-red-400' : ''}`} 
        />
      )}
    </Button>
  );
}

// Компонент иконки микрофона
function MicrophoneIcon({ size, className }: { size: number, className?: string }) {
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
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

// Компонент иконки загрузки
function LoadingSpinner({ size, className }: { size: number, className?: string }) {
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
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
} 