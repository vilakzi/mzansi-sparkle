import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: NewConversationDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-search', searchQuery],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!searchQuery.trim()) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .neq('id', user.id)
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(20);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: open && searchQuery.length > 0,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase
        .rpc('get_or_create_conversation', { p_other_user_id: userId });

      if (error) throw error;
      return data as string;
    },
    onSuccess: (conversationId) => {
      onConversationCreated(conversationId);
      onOpenChange(false);
      setSearchQuery("");
    },
    onError: (error: Error) => {
      if (error.message.includes('blocked')) {
        toast.error("Cannot start conversation with this user");
      } else {
        toast.error("Failed to create conversation");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* User List */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))
            ) : users && users.length > 0 ? (
              users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => createConversationMutation.mutate(user.id)}
                  disabled={createConversationMutation.isPending}
                  className="w-full flex items-center gap-3 p-3 hover:bg-accent rounded-lg transition-colors text-left disabled:opacity-50"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={user.avatar_url || ''} />
                    <AvatarFallback>
                      {user.display_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.display_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      @{user.username}
                    </p>
                  </div>
                  {createConversationMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </button>
              ))
            ) : searchQuery.length > 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No users found</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Search for users to start a conversation</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
