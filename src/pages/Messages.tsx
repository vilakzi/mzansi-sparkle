import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, MessageCircle, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { NewConversationDialog } from "@/components/NewConversationDialog";

interface ConversationWithProfile {
  id: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function Messages() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's conversations with participant info
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          unread_count,
          conversations!inner(
            id,
            last_message_at,
            last_message_preview
          )
        `)
        .eq('user_id', user.id)
        .order('conversations(last_message_at)', { ascending: false });

      if (participantError) throw participantError;

      // Get other participants for each conversation
      const conversationIds = participantData?.map(p => p.conversation_id) || [];
      
      if (conversationIds.length === 0) return [];

      const { data: otherParticipants, error: otherError } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          profiles!inner(
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .in('conversation_id', conversationIds)
        .neq('user_id', user.id);

      if (otherError) throw otherError;

      // Combine data
      const result: ConversationWithProfile[] = participantData.map(p => {
        const otherUser = otherParticipants?.find(
          op => op.conversation_id === p.conversation_id
        );

        return {
          id: p.conversation_id,
          last_message_at: p.conversations.last_message_at,
          last_message_preview: p.conversations.last_message_preview,
          unread_count: p.unread_count,
          other_user: {
            id: otherUser?.profiles?.id || '',
            username: otherUser?.profiles?.username || 'Unknown',
            display_name: otherUser?.profiles?.display_name || 'Unknown User',
            avatar_url: otherUser?.profiles?.avatar_url || null,
          }
        };
      });

      return result;
    },
    enabled: !!currentUserId,
  });

  // Realtime subscription for conversation updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('conversations-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        () => {
          refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refetch]);

  const filteredConversations = conversations?.filter(conv =>
    conv.other_user.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.other_user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = conversations?.reduce((sum, conv) => sum + conv.unread_count, 0) || 0;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Messages</h1>
            {totalUnread > 0 && (
              <p className="text-sm text-muted-foreground">{totalUnread} unread</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNewChat(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </header>

      {/* Conversations List */}
      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))
        ) : filteredConversations && filteredConversations.length > 0 ? (
          filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => navigate(`/messages/${conversation.id}`)}
              className="w-full p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left"
            >
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={conversation.other_user.avatar_url || ''} />
                <AvatarFallback>
                  {conversation.other_user.display_name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-semibold truncate ${conversation.unread_count > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
                    {conversation.other_user.display_name}
                  </h3>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {conversation.last_message_preview || 'No messages yet'}
                  </p>
                  {conversation.unread_count > 0 && (
                    <span className="ml-2 shrink-0 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {conversation.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <MessageCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No conversations yet</h3>
            <p className="text-muted-foreground mb-6">
              Start a conversation with someone to see it here
            </p>
            <Button onClick={() => setShowNewChat(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Start Conversation
            </Button>
          </div>
        )}
      </div>

      <NewConversationDialog
        open={showNewChat}
        onOpenChange={setShowNewChat}
        onConversationCreated={(conversationId) => {
          navigate(`/messages/${conversationId}`);
        }}
      />
    </div>
  );
}
