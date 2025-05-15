'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OAuthCallback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (code && state) {
      // Send message to opener window about successful authentication
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_SUCCESS', code, state }, '*');
        window.close();
      }
    } else {
      // Handle error
      const error = searchParams.get('error');
      const error_description = searchParams.get('error_description');
      
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'OAUTH_ERROR', 
          error, 
          error_description 
        }, '*');
        window.close();
      }
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-4">Completing Authentication</h1>
        <p className="text-gray-600">Please wait while we complete the authentication process...</p>
      </div>
    </div>
  );
} 