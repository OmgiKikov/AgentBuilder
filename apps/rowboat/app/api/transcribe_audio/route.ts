import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('API: Получен запрос на транскрипцию аудио');
  
  try {
    // Получаем формдату из запроса
    const formData = await req.formData();
    console.log('API: FormData получен из запроса');
    
    // Проверяем наличие файла аудио
    const audioFile = formData.get('audio') as File;
    if (!audioFile) {
      console.error('API: Аудио файл отсутствует в запросе');
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }
    
    console.log(`API: Аудио файл получен, размер: ${audioFile.size} байт, тип: ${audioFile.type}`);

    // Определяем API URL из переменных окружения или используем значение по умолчанию
    const apiUrl = process.env.COPILOT_API_URL || 'http://localhost:3002';
    console.log(`API: Используется URL для Copilot API: ${apiUrl}`);
    
    // Создаем новую FormData для отправки на бэкенд
    const newFormData = new FormData();
    newFormData.append('audio', audioFile);
    
    // Получаем язык из формы или используем русский по умолчанию
    const language = formData.get('language') || 'ru';
    newFormData.append('language', language as string);
    console.log(`API: Используемый язык: ${language}`);
    
    // Получаем API-ключ из запроса
    const authHeader = req.headers.get('Authorization');
    console.log(`API: Заголовок Authorization ${authHeader ? 'присутствует' : 'отсутствует'}`);
    
    // Отправляем запрос к бэкенду Copilot
    console.log(`API: Отправка запроса к ${apiUrl}/transcribe_audio`);
    const response = await fetch(`${apiUrl}/transcribe_audio`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || `Bearer ${process.env.API_KEY || ''}`,
      },
      body: newFormData,
    });
    
    console.log(`API: Получен ответ от Copilot API, статус: ${response.status}`);
    
    // Проверяем ответ
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API: Ошибка от Copilot API: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to transcribe audio: ${errorText}` },
        { status: response.status }
      );
    }
    
    // Возвращаем результат в ответе
    const data = await response.json();
    console.log(`API: Данные от Copilot API:`, data);
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('API: Ошибка при обработке запроса на транскрипцию:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 