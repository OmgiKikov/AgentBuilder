'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SlidePanel } from '@/components/ui/slide-panel';
import { Info, Lock, Power, RefreshCw, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { 
  McpServer, 
  McpTool, 
  listMcpServers, 
  enableServer
} from '@/app/actions/klavis_actions';

const SERVERS_REQUIRING_AUTH = [
  'firecrawl web search',
  'firecrawl deep research',
  'github',
  'google drive',
  'jira',
  'notion',
  'resend',
  'slack',
  'wordpress',
  'supabase',
  'postgres',
  'google docs'
];

const SERVER_PRIORITY: Record<string, number> = {
  'GitHub': 1,
  'Slack': 2,
  'Jira': 3,
  'Discord': 4,
  'YouTube': 5,
  'Firecrawl Web Search': 6,
  'Firecrawl Deep Research': 7,
  'Notion': 8
};

function sortServers(servers: McpServer[]): McpServer[] {
  return [...servers].sort((a, b) => {
    const priorityA = SERVER_PRIORITY[a.serverName] || 999;
    const priorityB = SERVER_PRIORITY[b.serverName] || 999;
    
    if (priorityA === priorityB) {
      // If neither has priority or both have same priority, sort alphabetically
      return a.serverName.localeCompare(b.serverName);
    }
    
    return priorityA - priorityB;
  });
}

const fadeInAnimation = {
  '@keyframes fadeIn': {
    '0%': { opacity: 0, transform: 'translateY(-5px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' }
  },
  '.animate-fadeIn': {
    animation: 'fadeIn 0.2s ease-out'
  }
} as const;

interface ServerLogoProps {
  serverName: string;
  className?: string;
}

function ServerLogo({ serverName, className = "" }: ServerLogoProps) {
  const logoMap: Record<string, string> = {
    'GitHub': '/mcp-server-images/github.svg',
    'Google Drive': '/mcp-server-images/gdrive.svg',
    'Google Docs': '/mcp-server-images/gdocs.svg',
    'Jira': '/mcp-server-images/jira.svg',
    'Notion': '/mcp-server-images/notion.svg',
    'Resend': '/mcp-server-images/resend.svg',
    'Slack': '/mcp-server-images/slack.svg',
    'WordPress': '/mcp-server-images/wordpress.svg',
    'Supabase': '/mcp-server-images/supabase.svg',
    'Postgres': '/mcp-server-images/postgres.svg',
    'Firecrawl Web Search': '/mcp-server-images/firecrawl.webp',
    'Firecrawl Deep Research': '/mcp-server-images/firecrawl.webp',
    'Discord': '/mcp-server-images/discord.svg',
    'YouTube': '/mcp-server-images/youtube.svg',
  };

  const logoPath = logoMap[serverName] || '';
  
  if (!logoPath) return null;

  return (
    <div className={`relative w-6 h-6 ${className}`}>
      <Image
        src={logoPath}
        alt={`${serverName} logo`}
        fill
        className="object-contain"
      />
    </div>
  );
}

export function HostedTools() {
  const params = useParams();
  const projectId = typeof params.projectId === 'string' ? params.projectId : params.projectId?.[0];
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toggleError, setToggleError] = useState<{serverId: string; message: string} | null>(null);
  const [enabledServers, setEnabledServers] = useState<Set<string>>(new Set());
  const [togglingServers, setTogglingServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchServers();
  }, []);

  async function fetchServers() {
    try {
      setLoading(true);
      const response = await listMcpServers();
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.data) {
        throw new Error('No data received from server');
      }
      
      setServers(response.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load MCP servers');
      console.error('Error fetching servers:', err);
      // Initialize empty array to prevent map errors
      setServers([]);
    } finally {
      setLoading(false);
    }
  }

  // Initialize enabled servers on load and keep it updated
  useEffect(() => {
    if (servers) {
      console.log('Updating enabled servers from server data:', servers);
      // A server is considered enabled if it is active
      const enabled = new Set(
        servers
          .filter(server => server.isActive)
          .map(server => server.serverName)
      );
      console.log('New enabled servers state:', Array.from(enabled));
      setEnabledServers(enabled);
    }
  }, [servers]);

  const handleToggleTool = async (server: McpServer) => {
    try {
      const serverKey = server.serverName;
      console.log('Toggle:', { server: serverKey, newState: !enabledServers.has(serverKey) });

      setTogglingServers(prev => new Set([...prev, serverKey]));
      setToggleError(null);

      const isCurrentlyEnabled = enabledServers.has(serverKey);
      const newState = !isCurrentlyEnabled;
      
      try {
        const result = await enableServer(server.serverName, projectId || "", newState);
        
        // Update local state immediately
        setEnabledServers(prev => {
          const next = new Set(prev);
          if (!newState) {
            next.delete(serverKey);
          } else if (result.instanceId) {
            next.add(serverKey);
          }
          return next;
        });

        // Update servers state immediately
        setServers(prevServers => {
          return prevServers.map(s => {
            if (s.serverName === serverKey) {
              return {
                ...s,
                isActive: newState,
                instanceId: newState ? (result.instanceId || s.instanceId) : s.id,
                serverUrl: newState ? result.serverUrl : undefined,
                isAuthenticated: newState ? false : undefined // Reset authentication when toggling off
              };
            }
            return s;
          });
        });

        // Update server list in background
        const updatedServers = await listMcpServers();
        
        if (updatedServers.data) {
          setServers(updatedServers.data);
          // Verify our local state matches server state
          const serverState = updatedServers.data.find(s => s.serverName === serverKey);
          const serverEnabled = Boolean(serverState?.isActive);
          
          if (serverEnabled !== newState) {
            console.log('State mismatch:', { server: serverKey, expected: newState, actual: serverEnabled });
            setEnabledServers(prev => {
              const next = new Set(prev);
              if (serverEnabled) {
                next.add(serverKey);
              } else {
                next.delete(serverKey);
              }
              return next;
            });
          }
        }
      } catch (err) {
        console.error('Toggle failed:', { server: serverKey, error: err });
        // Revert local state on error
        setEnabledServers(prev => {
          const next = new Set(prev);
          if (newState) {
            next.delete(serverKey);
          } else {
            next.add(serverKey);
          }
          return next;
        });
        setToggleError({
          serverId: serverKey,
          message: 'Failed to toggle server'
        });
      }
    } finally {
      setTogglingServers(prev => {
        const next = new Set(prev);
        next.delete(server.serverName);
        return next;
      });
    }
  };

  const handleAuthenticate = async (server: McpServer) => {
    try {
      // Direct OAuth flow without white labeling
      const authWindow = window.open(
        `https://api.klavis.ai/oauth/${server.serverName.toLowerCase()}/authorize?instance_id=${server.instanceId}`,
        '_blank',
        'width=600,height=700'
      );

      if (authWindow) {
        // Poll for window closure
        const checkInterval = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            console.log('OAuth window closed, refreshing server status...');
            fetchServers(); // Refresh the server list to get updated auth status
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      window.alert('Failed to setup authentication');
    }
  };

  const handleCreateServer = async (serverName: string) => {
    if (!projectId) {
      console.error('No project ID available');
      return;
    }

    try {
      await enableServer(serverName, projectId, true);
      await fetchServers(); // Refresh the list
      
      // For GitHub, we'll need to refresh the servers list to get the instance ID
      if (serverName.toLowerCase().includes('github')) {
        const servers = await listMcpServers();
        const githubServer = servers.data?.find(s => s.serverName === serverName);
        if (githubServer) {
          window.open(`https://api.klavis.ai/oauth/github/authorize?instance_id=${githubServer.instanceId}`, '_blank');
        }
      }
    } catch (err) {
      console.error('Error creating server:', err);
    }
  };

  const filteredServers = sortServers(servers.filter(server => {
    const searchLower = searchQuery.toLowerCase();
    return (
      server.serverName.toLowerCase().includes(searchLower) ||
      server.description.toLowerCase().includes(searchLower) ||
      server.tools.some(tool => 
        tool.name.toLowerCase().includes(searchLower) ||
        tool.description.toLowerCase().includes(searchLower)
      )
    );
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Search servers or tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md 
              bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
              hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchServers}
          disabled={loading}
        >
          <div className="inline-flex items-center">
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            <span className="ml-2">Refresh</span>
          </div>
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 dark:border-gray-200 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading tools...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServers.map((server) => (
            <div
              key={server.instanceId}
              className="relative border-2 border-gray-200/80 dark:border-gray-700/80 rounded-xl p-6 
                bg-white dark:bg-gray-900 shadow-sm dark:shadow-none 
                backdrop-blur-sm hover:shadow-md dark:hover:shadow-none 
                transition-all duration-200 flex flex-col
                hover:border-blue-200 dark:hover:border-blue-900"
            >
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ServerLogo serverName={server.serverName} className="mr-2" />
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{server.serverName}</h3>
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                          bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                          {server.tools.length} tools
                        </span>
                      </div>
                      <Switch
                        checked={enabledServers.has(server.serverName)}
                        onCheckedChange={() => handleToggleTool(server)}
                        disabled={togglingServers.has(server.serverName)}
                        className={clsx(
                          "data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600",
                          "data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700",
                          togglingServers.has(server.serverName) && "opacity-50 cursor-not-allowed"
                        )}
                      />
                    </div>
                    {toggleError?.serverId === server.serverName && (
                      <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 
                        py-1 px-2 rounded-md mt-2 animate-fadeIn">
                        {toggleError.message}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></span>
                      Klavis AI
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 line-clamp-2">
                    {server.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-auto">
                  {SERVERS_REQUIRING_AUTH.includes(server.serverName.toLowerCase()) && 
                   server.isActive && (
                    <div className="inline-flex items-center space-x-2">
                      {!server.isAuthenticated && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleAuthenticate(server)}
                        >
                          <div className="inline-flex items-center">
                            <Lock className="h-3.5 w-3.5" />
                            <span className="ml-1.5">Auth</span>
                          </div>
                        </Button>
                      )}
                      <div className={clsx(
                        "text-xs py-1 px-2 rounded-full",
                        server.isAuthenticated 
                          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                          : "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                      )}>
                        {server.isAuthenticated ? 'Authenticated' : 'Not authenticated'}
                      </div>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedServer(server)}
                    className="ml-auto"
                  >
                    <div className="inline-flex items-center">
                      <Info className="h-4 w-4" />
                      <span className="ml-1.5">Tools</span>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlidePanel
        isOpen={!!selectedServer}
        onClose={() => setSelectedServer(null)}
        title={selectedServer?.serverName || 'Server Details'}
      >
        {selectedServer && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Available Tools</h4>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium 
                  bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {selectedServer.tools.length}
                </span>
              </div>
              <div className="space-y-4">
                {selectedServer.tools.map((tool) => (
                  <div
                    key={`${selectedServer.instanceId}-${tool.id}`}
                    className="group p-4 rounded-lg bg-gray-50/50 dark:bg-gray-800/50"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 rounded-md text-sm font-medium 
                          bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                          {tool.name}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 pl-2.5">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
} 