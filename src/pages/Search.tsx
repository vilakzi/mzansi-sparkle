import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Search as SearchIcon, TrendingUp, Hash, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  followers_count: number;
};

type Hashtag = {
  id: string;
  name: string;
  posts_count: number;
};

type Post = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  likes_count: number;
  comments_count: number;
};

const Search = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (data) setUserProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setUsers([]);
      setHashtags([]);
      setPosts([]);
      return;
    }

    setLoading(true);
    try {
      const searchTerm = searchQuery.trim().toLowerCase();

      // Search users
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, followers_count")
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(20);

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Search hashtags
      const hashtagQuery = searchTerm.startsWith("#") ? searchTerm.substring(1) : searchTerm;
      const { data: hashtagsData, error: hashtagsError } = await supabase
        .from("hashtags")
        .select("id, name, posts_count")
        .ilike("name", `%${hashtagQuery}%`)
        .order("posts_count", { ascending: false })
        .limit(20);

      if (hashtagsError) throw hashtagsError;
      setHashtags(hashtagsData || []);

      // Search posts by caption
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select("id, media_url, media_type, caption, likes_count, comments_count")
        .ilike("caption", `%${searchTerm}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (postsError) throw postsError;
      setPosts(postsData || []);
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    handleSearch(value);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-50 bg-background border-b p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Search</h1>
          </div>
          
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users, hashtags, or posts..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {query ? (
          <Tabs defaultValue="users" className="p-4">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="hashtags">Hashtags</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-3 mt-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Searching...</p>
              ) : users.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No users found</p>
              ) : (
                users.map((user) => (
                  <Card
                    key={user.id}
                    className="p-4 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => navigate(`/profile/${user.username}`)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{user.display_name[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{user.username}</div>
                        <div className="text-sm text-muted-foreground">
                          {user.display_name} · {user.followers_count} followers
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="hashtags" className="space-y-3 mt-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Searching...</p>
              ) : hashtags.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hashtags found</p>
              ) : (
                hashtags.map((hashtag) => (
                  <Card
                    key={hashtag.id}
                    className="p-4 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => navigate(`/hashtag/${hashtag.name}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Hash className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold">#{hashtag.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {hashtag.posts_count} posts
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="posts" className="mt-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Searching...</p>
              ) : posts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No posts found</p>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {posts.map((post) => (
                    <Card key={post.id} className="aspect-square overflow-hidden">
                      {post.media_type.startsWith("image") ? (
                        <img
                          src={post.media_url}
                          alt={post.caption || "Post"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={post.media_url}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Search for users, hashtags, or content</p>
          </div>
        )}
      </div>
      
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Search;
