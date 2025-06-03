'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Code, TestTube, Save, Search, FileText, CheckCircle } from 'lucide-react';

export function NoCodeMCPBuilder() {
  const [step, setStep] = useState<'describe' | 'source' | 'configure' | 'test' | 'save'>('describe');
  const [toolDescription, setToolDescription] = useState('');
  const [selectedSource, setSelectedSource] = useState<'template' | 'custom' | 'search' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestedAPIs, setSuggestedAPIs] = useState<Array<{
    name: string;
    description: string;
    confidence: number;
    requiresAuth: boolean;
  }>>([]);
  const [selectedAPI, setSelectedAPI] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<{
    endpoint: string;
    method: string;
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
    headers: Record<string, string>;
  } | null>(null);
  
  const exampleTools = [
    {
      title: "Курс валют",
      description: "Инструмент для получения актуального курса валют",
      prompt: "Создай инструмент для получения курса валют. Принимает код валюты (USD, EUR, RUB) и возвращает текущий курс."
    },
    {
      title: "Погода",
      description: "Получение прогноза погоды для города",
      prompt: "Создай инструмент для получения погоды. Принимает название города и возвращает температуру, влажность и описание погоды."
    },
    {
      title: "Поиск компаний",
      description: "Поиск информации о компаниях",
      prompt: "Создай инструмент для поиска информации о компаниях. Принимает название компании и возвращает описание, сайт, индустрию."
    },
    {
      title: "Калькулятор",
      description: "Математические вычисления",
      prompt: "Создай инструмент-калькулятор. Принимает математическое выражение и возвращает результат вычисления."
    }
  ];

  const handleExampleClick = (prompt: string) => {
    setToolDescription(prompt);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-purple-100 dark:border-purple-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
            <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Создать MCP инструмент с AI
          </h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Опишите, какой инструмент вам нужен, и AI создаст его для вас. Никакого кода!
        </p>
      </div>

      {/* Шаги */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            step === 'describe' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Описание</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 dark:bg-gray-700" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            step === 'source' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <Code className="h-4 w-4" />
            <span className="text-sm font-medium">Источник</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 dark:bg-gray-700" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            step === 'configure' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <Code className="h-4 w-4" />
            <span className="text-sm font-medium">Настройка</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 dark:bg-gray-700" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            step === 'test' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <TestTube className="h-4 w-4" />
            <span className="text-sm font-medium">Тест</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 dark:bg-gray-700" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            step === 'save' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-800'
          }`}>
            <Save className="h-4 w-4" />
            <span className="text-sm font-medium">Сохранение</span>
          </div>
        </div>
      </div>

      {/* Контент для текущего шага */}
      <div className="p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        {step === 'describe' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Опишите инструмент, который хотите создать
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI сгенерирует код MCP инструмента на основе вашего описания
              </p>
            </div>
            
            <textarea
              value={toolDescription}
              onChange={(e) => setToolDescription(e.target.value)}
              placeholder="Например: Создай инструмент для получения текущего курса валют. Он должен принимать код валюты и возвращать курс к доллару США."
              className="w-full h-32 px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg 
                bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400
                resize-none"
            />

            {/* Примеры */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Примеры инструментов:
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {exampleTools.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(example.prompt)}
                    className="text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 
                      hover:border-purple-300 dark:hover:border-purple-700 
                      hover:bg-purple-50 dark:hover:bg-purple-900/20 
                      transition-all duration-200 group"
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      {example.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {example.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                💡 Будет использован Claude для генерации кода
              </div>
              <Button
                onClick={() => setStep('source')}
                disabled={!toolDescription.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Создать с AI
              </Button>
            </div>
          </div>
        )}
        
        {step === 'source' && (
          <div className="space-y-6">
            {!isAnalyzing && suggestedAPIs.length === 0 && (
              <>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    AI анализирует ваш запрос...
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {`Для инструмента: "${toolDescription}"`}
                  </p>
                </div>

                <div className="flex justify-center py-8">
                  <Button
                    onClick={() => {
                      setIsAnalyzing(true);
                      // Симуляция анализа (в реальности будет вызов API)
                      setTimeout(() => {
                        setSuggestedAPIs([
                          {
                            name: "Amadeus API",
                            description: "Профессиональное API для поиска и бронирования авиабилетов",
                            confidence: 95,
                            requiresAuth: true
                          },
                          {
                            name: "Skyscanner API", 
                            description: "Популярное API для сравнения цен на авиабилеты",
                            confidence: 90,
                            requiresAuth: true
                          },
                          {
                            name: "Aviation Stack",
                            description: "API для получения информации о рейсах в реальном времени",
                            confidence: 75,
                            requiresAuth: true
                          }
                        ]);
                        setIsAnalyzing(false);
                      }, 2000);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Найти подходящие API
                  </Button>
                </div>
              </>
            )}

            {isAnalyzing && (
              <div className="text-center py-12">
                <div className="inline-flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span className="text-gray-600 dark:text-gray-400">AI ищет подходящие API...</span>
                </div>
              </div>
            )}

            {!isAnalyzing && suggestedAPIs.length > 0 && (
              <>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Найденные API для вашей задачи
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    AI проанализировал документацию и нашел подходящие варианты
                  </p>
                </div>

                <div className="space-y-3">
                  {suggestedAPIs.map((api, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSelectedAPI(api.name);
                        setSelectedSource('search');
                        // Симуляция загрузки конфигурации API
                        setApiConfig({
                          endpoint: "https://api.amadeus.com/v2/shopping/flight-offers",
                          method: "GET",
                          parameters: [
                            {
                              name: "originLocationCode",
                              type: "string",
                              required: true,
                              description: "Код аэропорта вылета (IATA)"
                            },
                            {
                              name: "destinationLocationCode", 
                              type: "string",
                              required: true,
                              description: "Код аэропорта прилета (IATA)"
                            },
                            {
                              name: "departureDate",
                              type: "date",
                              required: true,
                              description: "Дата вылета (YYYY-MM-DD)"
                            },
                            {
                              name: "adults",
                              type: "number",
                              required: false,
                              description: "Количество взрослых пассажиров"
                            }
                          ],
                          headers: {
                            "Authorization": "Bearer {{API_KEY}}"
                          }
                        });
                        setStep('configure');
                      }}
                      className="w-full text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 
                        hover:border-purple-300 dark:hover:border-purple-700 
                        hover:bg-purple-50 dark:hover:bg-purple-900/20 
                        transition-all duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {api.name}
                            </h4>
                            {api.confidence >= 90 && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-full">
                                Рекомендуется
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                            {api.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              Совпадение: {api.confidence}%
                            </span>
                            {api.requiresAuth && (
                              <span className="text-amber-600 dark:text-amber-400">
                                Требуется API ключ
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <FileText className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => {
                      setSuggestedAPIs([]);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Искать другие варианты
                  </button>
                  <button
                    onClick={() => {
                      setSelectedSource('custom');
                      setStep('configure');
                    }}
                    className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Использовать свое API →
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        
        {step === 'configure' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Настройка инструмента
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedAPI ? `Используется ${selectedAPI}` : 'Настройте параметры инструмента'}
              </p>
            </div>

            {apiConfig && (
              <>
                {/* Основная информация */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Название инструмента
                    </label>
                    <input
                      type="text"
                      defaultValue="search_flights"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg 
                        bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 
                        focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Описание
                    </label>
                    <input
                      type="text"
                      defaultValue="Поиск доступных авиабилетов"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg 
                        bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 
                        focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                    />
                  </div>
                </div>

                {/* API Endpoint */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded">
                      {apiConfig.method}
                    </span>
                    <code className="text-xs text-gray-600 dark:text-gray-400">
                      {apiConfig.endpoint}
                    </code>
                  </div>
                </div>

                {/* Параметры */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Параметры инструмента
                  </h4>
                  <div className="space-y-3">
                    {apiConfig.parameters.map((param, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <input
                          type="checkbox"
                          defaultChecked={true}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {param.name}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                              {param.type}
                            </span>
                            {param.required && (
                              <span className="text-xs text-red-600 dark:text-red-400">
                                обязательный
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {param.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API ключ */}
                {selectedAPI && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Требуется API ключ
                    </h4>
                    <input
                      type="password"
                      placeholder="Введите ваш API ключ для Amadeus"
                      className="w-full px-3 py-2 text-sm border border-amber-200 dark:border-amber-700 rounded-lg 
                        bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 
                        focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
                    />
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      Ключ будет сохранен в зашифрованном виде
                    </p>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    variant="secondary"
                    onClick={() => setStep('source')}
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={() => setStep('test')}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Протестировать
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        
        {step === 'test' && (
          <div className="text-center py-8 text-gray-500">
            Тестирование инструмента (в разработке)
          </div>
        )}
        
        {step === 'save' && (
          <div className="text-center py-8 text-gray-500">
            Сохранение инструмента (в разработке)
          </div>
        )}
      </div>
    </div>
  );
} 