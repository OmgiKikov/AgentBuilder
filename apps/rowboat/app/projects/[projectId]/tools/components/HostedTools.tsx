'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SlidePanel } from '@/components/ui/slide-panel';
import { Info, Lock, Power, RefreshCw, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { 
  listAvailableMcpServers,
  enableServer,
  updateProjectServers
} from '@/app/actions/klavis_actions';
import { toggleMcpTool, getSelectedMcpTools } from '@/app/actions/mcp_actions';
import { z } from 'zod';
import { MCPServer } from '@/app/lib/types/types';
import { Checkbox } from '@heroui/react';
import { projectsCollection } from '@/app/lib/mongodb';

type McpServerType = z.infer<typeof MCPServer>;
type McpToolType = z.infer<typeof MCPServer>['tools'][number];
type FilterType = 'all' | 'available' | 'coming-soon' | 'popular';

const SERVER_PRIORITY: Record<string, number> = {
  'GitHub': 1,
  'Slack': 2,
  'Google Drive': 3,
  'Google Docs': 4,
  'Jira': 5,
  'Discord': 6,
  'YouTube': 7,
  'Firecrawl Web Search': 8,
  'Firecrawl Deep Research': 9,
  'Notion': 10
};

function sortServers(servers: McpServerType[], filterType: FilterType = 'all'): McpServerType[] {
  return [...servers].sort((a, b) => {
    // For popular view, only sort priority servers
    if (filterType === 'popular') {
      const priorityA = SERVER_PRIORITY[a.name] || 999;
      const priorityB = SERVER_PRIORITY[b.name] || 999;
      if (priorityA === 999 && priorityB === 999) return 0;
      return priorityA - priorityB;
    }

    // For all view, sort by priority first, then available/coming soon
    if (filterType === 'all') {
      const priorityA = SERVER_PRIORITY[a.name] || 999;
      const priorityB = SERVER_PRIORITY[b.name] || 999;
      const hasToolsA = (a.tools || []).length > 0;
      const hasToolsB = (b.tools || []).length > 0;

      // If both are priority servers, sort by priority
      if (priorityA !== 999 && priorityB !== 999) {
        return priorityA - priorityB;
      }
      // If one is priority server, it comes first
      if (priorityA !== 999) return -1;
      if (priorityB !== 999) return 1;
      // If neither is priority, available servers come before coming soon
      if (hasToolsA !== hasToolsB) {
        return hasToolsA ? -1 : 1;
      }
      // If both are same type (available or coming soon), sort alphabetically
      return a.name.localeCompare(b.name);
    }

    // For other views, sort alphabetically
    return a.name.localeCompare(b.name);
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

export function ServerLogo({ serverName, className = "" }: ServerLogoProps) {
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

const toolCardStyles = {
    base: clsx(
        "group p-4 rounded-lg transition-all duration-200",
        "bg-gray-50/50 dark:bg-gray-800/50",
        "hover:bg-gray-100/50 dark:hover:bg-gray-700/50",
        "border border-transparent",
        "hover:border-gray-200 dark:hover:border-gray-600"
    ),
};

const ToolCard = ({ 
  tool, 
  server, 
  isSelected, 
  onSelect, 
  showCheckbox = false 
}: { 
  tool: McpToolType; 
  server: McpServerType; 
  isSelected?: boolean; 
  onSelect?: (selected: boolean) => void;
  showCheckbox?: boolean;
}) => {
  return (
    <div className={toolCardStyles.base}>
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <Checkbox
            isSelected={isSelected}
            onValueChange={onSelect}
            size="sm"
          />
        )}
        <div className="flex-1">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            {tool.name}
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tool.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export function HostedTools() {
  const params = useParams();
  const projectId = typeof params.projectId === 'string' ? params.projectId : params.projectId?.[0];
  if (!projectId) throw new Error('Project ID is required');
  
  const [servers, setServers] = useState<McpServerType[]>([]);
  const [selectedServer, setSelectedServer] = useState<McpServerType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [toggleError, setToggleError] = useState<{serverId: string; message: string} | null>(null);
  const [enabledServers, setEnabledServers] = useState<Set<string>>(new Set());
  const [togglingServers, setTogglingServers] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [togglingTools, setTogglingTools] = useState<Set<string>>(new Set());
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [hasToolChanges, setHasToolChanges] = useState(false);
  const [savingTools, setSavingTools] = useState(false);
  const [serverToolCounts, setServerToolCounts] = useState<Map<string, number>>(new Map());
  const [availableTools, setAvailableTools] = useState<Map<string, McpToolType[]>>(new Map());

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listAvailableMcpServers(projectId || "");
      
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
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Initialize enabled servers on load and keep it updated
  useEffect(() => {
    if (servers) {
      console.log('Updating enabled servers from server data:', servers);
      // A server is considered enabled if it is active (from Klavis)
      const enabled = new Set(
        servers
          .filter(server => server.isActive)
          .map(server => server.name)
      );
      console.log('New enabled servers state:', Array.from(enabled));
      setEnabledServers(enabled);
    }
  }, [servers]);

  // Initialize tool counts from Klavis and MongoDB when servers are loaded
  useEffect(() => {
    const newCounts = new Map<string, number>();
    servers.forEach(server => {
      if (isServerEligible(server)) {
        // Count selected tools from MongoDB
        newCounts.set(server.name, server.tools.length);
        
        console.log('[Tools] Server tool counts:', {
          server: server.name,
          availableFromKlavis: server.availableTools?.length || 0,
          selectedFromMongo: server.tools.length
        });
      }
    });
    setServerToolCounts(newCounts);
  }, [servers]);

  // Initialize selected tools when opening the panel
  useEffect(() => {
    if (selectedServer) {
      // Initialize selected tools from MongoDB data
      setSelectedTools(new Set(selectedServer.tools.map(t => t.id)));
      setHasToolChanges(false);
    }
  }, [selectedServer]);

  // Helper function to check if a server is eligible (using Klavis status)
  const isServerEligible = (server: McpServerType) => {
    return server.isActive && (!server.authNeeded || server.isAuthenticated);
  };

  const handleToggleTool = async (server: McpServerType) => {
    try {
        const serverKey = server.name;
        console.log('Toggle:', { server: serverKey, newState: !enabledServers.has(serverKey) });

        setTogglingServers(prev => new Set([...prev, serverKey]));
        setToggleError(null);

        const isCurrentlyEnabled = enabledServers.has(serverKey);
        const newState = !isCurrentlyEnabled;
        
        try {
            const result = await enableServer(server.name, projectId || "", newState);
            
            // Update local state after all operations are complete
            setEnabledServers(prev => {
                const next = new Set(prev);
                if (!newState) {
                    next.delete(serverKey);
                } else if ('instanceId' in result) {
                    next.add(serverKey);
                }
                return next;
            });

            // Update only the specific server in the servers state
            setServers(prevServers => {
                return prevServers.map(s => {
                    if (s.name === serverKey) {
                        if (!newState) {
                            // If disabling, preserve server structure but clear operational data
                            return {
                                ...s,
                                isActive: false,
                                serverUrl: undefined,
                                tools: [],
                                availableTools: s.availableTools, // Keep available tools list
                                isAuthenticated: false
                            };
                        } else if ('instanceId' in result) {
                            // If enabling, wait for server response to update tools
                            return {
                                ...s,
                                isActive: true,
                                instanceId: result.instanceId,
                                serverUrl: result.serverUrl,
                                isAuthenticated: false
                            };
                        }
                    }
                    return s;
                });
            });

            // Update tool counts
            setServerToolCounts(prev => {
                const next = new Map(prev);
                if (!newState) {
                    next.set(serverKey, 0); // Set to 0 instead of deleting
                }
                return next;
            });

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
                message: "We're having trouble setting up this server. Please reach out on discord."
            });
        }
    } finally {
        setTogglingServers(prev => {
            const next = new Set(prev);
            next.delete(server.name);
            return next;
        });
    }
};

  const handleAuthenticate = async (server: McpServerType) => {
    try {
      const authWindow = window.open(
        `https://api.klavis.ai/oauth/${server.name.toLowerCase()}/authorize?instance_id=${server.instanceId}&redirect_url=${window.location.origin}/projects/${projectId}/tools/oauth/callback`,
        '_blank',
        'width=600,height=700'
      );

      if (authWindow) {
        const checkInterval = setInterval(async () => {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            console.log('OAuth window closed, refreshing server status...');
            
            // Update MongoDB through server action
            await updateProjectServers(projectId);
            
            // Update only this server's state
            const response = await listAvailableMcpServers(projectId);
            if (response.data) {
              setServers(prevServers => {
                return prevServers.map(s => {
                  if (s.name === server.name) {
                    const updatedServer = response.data?.find(us => us.name === server.name);
                    return updatedServer || s;
                  }
                  return s;
                });
              });
            }
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
      await fetchServers();
      
      const updatedServers = await listAvailableMcpServers(projectId);
      const server = updatedServers.data?.find(s => s.name === serverName);
      if (server?.requiresAuth) {
        window.open(`https://api.klavis.ai/oauth/${serverName.toLowerCase()}/authorize?instance_id=${server.instanceId}`, '_blank');
      }
    } catch (err) {
      console.error('Error creating server:', err);
    }
  };

  const handleSaveToolSelection = async () => {
    if (!selectedServer || !projectId) return;
    
    setSavingTools(true);
    try {
        // Get all available tools from Klavis and current selection state
        const availableTools = selectedServer.availableTools || [];
        
        // Update each available tool's state based on our selection
        for (const tool of availableTools) {
            const isSelected = selectedTools.has(tool.id);
            await toggleMcpTool(projectId, selectedServer.serverName, tool.id, isSelected);
        }
        
        // Update only the specific server in the servers state
        setServers(prevServers => {
            return prevServers.map(s => {
                if (s.name === selectedServer.name) {
                    return {
                        ...s,
                        tools: availableTools.filter(tool => selectedTools.has(tool.id))
                    };
                }
                return s;
            });
        });

        // Update selected server data
        setSelectedServer(prev => {
            if (!prev) return null;
            return {
                ...prev,
                tools: availableTools.filter(tool => selectedTools.has(tool.id))
            };
        });

        // Update tool counts for this server
        setServerToolCounts(prev => {
            const next = new Map(prev);
            next.set(selectedServer.name, selectedTools.size);
            return next;
        });
        
        setHasToolChanges(false);
    } catch (error) {
        console.error('Error saving tool selection:', error);
    } finally {
        setSavingTools(false);
    }
};

  const filteredServers = sortServers(servers.filter(server => {
    // First apply the search filter
    const searchLower = searchQuery.toLowerCase();
    const serverTools = server.tools || [];
    const matchesSearch = (
      server.name.toLowerCase().includes(searchLower) ||
      server.description.toLowerCase().includes(searchLower) ||
      serverTools.some(tool => 
        tool.name.toLowerCase().includes(searchLower) ||
        tool.description.toLowerCase().includes(searchLower)
      )
    );

    // Then apply the type filter
    const hasTools = (serverTools.length > 0);
    const isPriority = SERVER_PRIORITY[server.name] !== undefined;
    
    switch (activeFilter) {
      case 'available':
        return matchesSearch && hasTools && !isPriority;
      case 'coming-soon':
        return matchesSearch && !hasTools;
      case 'popular':
        return matchesSearch && isPriority;
      default:
        return matchesSearch;
    }
  }), activeFilter);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            To make hosted MCP tools available to agents in the Build view, first toggle the servers ON here. Some tools may require authentication after enabling.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'all', label: 'All' },
            { id: 'popular', label: 'Popular' },
            { id: 'available', label: 'More' },
            { id: 'coming-soon', label: 'Coming Soon' }
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id as FilterType)}
              className={clsx(
                'px-4 py-2 text-sm font-medium transition-colors relative',
                activeFilter === filter.id
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 rounded'
              )}
            >
              {filter.label}
              {activeFilter === filter.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
          ))}
        </div>

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
                transition-all duration-200 
                hover:border-blue-200 dark:hover:border-blue-900"
            >
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ServerLogo serverName={server.name} className="mr-2" />
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                          {server.name}
                        </h3>
                        {(server.availableTools || []).length > 0 ? (
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                            bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                            {(server.availableTools || []).length} tools available
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                            bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">
                            Coming soon
                          </span>
                        )}
                        {isServerEligible(server) && server.tools.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-xs font-medium 
                            bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                            {server.tools.length} tools selected
                          </span>
                        )}
                      </div>
                      {(server.availableTools || []).length > 0 && (
                        <Switch
                          checked={enabledServers.has(server.name)}
                          onCheckedChange={() => handleToggleTool(server)}
                          disabled={togglingServers.has(server.name)}
                          className={clsx(
                            "data-[state=checked]:bg-blue-500 dark:data-[state=checked]:bg-blue-600",
                            "data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700",
                            togglingServers.has(server.name) && "opacity-50 cursor-not-allowed"
                          )}
                        />
                      )}
                    </div>
                    {toggleError?.serverId === server.name && (
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
                  {server.isActive && server.authNeeded && (
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
                  {(server.availableTools || []).length > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedServer(server)}
                      className="ml-auto"
                    >
                      <div className="inline-flex items-center">
                        <Info className="h-4 w-4" />
                        <span className="ml-1.5">{isServerEligible(server) ? 'Manage Tools' : 'Tools'}</span>
                      </div>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlidePanel
        isOpen={!!selectedServer}
        onClose={() => {
          const closePanel = () => {
            setSelectedServer(null);
            setSelectedTools(new Set());
            setHasToolChanges(false);
          };

          if (hasToolChanges) {
            if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
              closePanel();
            }
          } else {
            closePanel();
          }
        }}
        title={selectedServer?.name || 'Server Details'}
      >
        {selectedServer && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Available Tools</h4>
                </div>
                {isServerEligible(selectedServer) && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const allTools = new Set<string>(selectedServer.availableTools?.map(t => t.id) || []);
                        setSelectedTools(prev => {
                          const next = prev.size === allTools.size ? new Set<string>() : allTools;
                          setHasToolChanges(true);
                          return next;
                        });
                      }}
                    >
                      {selectedTools.size === (selectedServer.availableTools || []).length ? 'Deselect All' : 'Select All'}
                    </Button>
                    {hasToolChanges && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSaveToolSelection}
                        disabled={savingTools}
                      >
                        {savingTools ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-b-transparent border-white mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {(selectedServer.availableTools || []).map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    server={selectedServer}
                    isSelected={selectedTools.has(tool.id)}
                    onSelect={(selected) => {
                      setSelectedTools(prev => {
                        const next = new Set(prev);
                        if (selected) {
                          next.add(tool.id);
                        } else {
                          next.delete(tool.id);
                        }
                        setHasToolChanges(true);
                        return next;
                      });
                    }}
                    showCheckbox={isServerEligible(selectedServer)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}