/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    webpack: (config, { isServer }) => {
        if (!isServer) {
            // Не включаем серверные модули в клиентский бандл
            config.resolve.fallback = {
                ...config.resolve.fallback,
                net: false,
                tls: false,
                fs: false,
                child_process: false,
            };
        }
        return config;
    },
    // Добавляем настройки компилятора TypeScript для поддержки downlevelIteration
    typescript: {
        // Переопределяем настройки компилятора
        compilerOptions: {
            downlevelIteration: true
        }
    }
};

export default nextConfig;
