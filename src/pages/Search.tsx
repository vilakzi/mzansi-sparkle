import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNav } from "@/components/BottomNav";
import { UploadButton } from "@/components/UploadButton";
import { Search as SearchIcon, Hash, ArrowLeft, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { ResponsiveImage } from "@/components/ResponsiveImage";

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

const SearchResultsSkeleton = () => (
  <div className="space-y-3 mt-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-3 p-4">
        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    ))}
  </div>
);

const PostGridSkeleton = () => (
  <div className="grid grid-cols-3 gap-1 mt-4">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <Skeleton key={i} className="aspect-square" />
    ))}
  </div>
);

const Search = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string } | undefined>();

  // Debounce prevents firing a query on every single keystroke
  const debouncedQuery = useDebounce(query, 350);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  // Only runs after typing stops for 350ms
  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery]);

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

  const runSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setUsers([]);
      setHashtags([]);
      setPosts([]);
      return;
    }

    setLoading(true);
    try {
      const searchTerm = searchQuery.trim().toLowerCase();
      const hashtagQuery = searchTerm.startsWith("#") ? searchTerm.substring(1) : searchTerm;

      // Fan out all three queries in parallel
      const [usersResult, hashtagsResult, postsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, followers_count")
          .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
          .order("followers_count", { ascending: false })
          .limit(20),
        supabase
          .from("hashtags")
          .select("id, name, posts_count")
          .ilike("name", `%${hashtagQuery}%`)
          .order("posts_count", { ascending: false })
          .limit(20),
        supabase
          .from("posts")
          .select("id, media_url, media_type, caption, likes_count, comments_count")
          .ilike("caption", `%${searchTerm}%`)
          .order("likes_count", { ascending: false })
          .limit(30),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (hashtagsResult.error) throw hashtagsResult.error;
      if (postsResult.error) throw postsResult.error;

      setUsers(usersResult.data || []);
      setHashtags(hashtagsResult.data || []);
      setPosts(postsResult.data || []);
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const hasResults = users.length > 0 || hashtags.length > 0 || posts.length > 0;

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
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        {query ? (
          <Tabs defaultValue="users" className="p-4">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="users" className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Users {!loading && users.length > 0 && <span className="ml-1 text-xs opacity-70">({users.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="hashtags" className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                Tags {!loading && hashtags.length > 0 && <span className="ml-1 text-xs opacity-70">({hashtags.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="posts" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Posts {!loading && posts.length > 0 && <span className="ml-1 text-xs opacity-70">({posts.length})</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-2">
              {loading ? (
                <SearchResultsSkeleton />
              ) : users.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No users found for "{query}"</p>
                </div>
              ) : (
                <div className="space-y-2 mt-4">
                  {users.map((user) => (
                    <Card
                      key={user.id}
                      className="p-4 cursor-pointer hover:bg-accent transition-colors active:scale-[0.99]"
                      onClick={() => navigate(`/profile/${user.username}`)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>{user.display_name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">@{user.username}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {user.display_name} · {user.followers_count.toLocaleString()} followers
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="hashtags" className="mt-2">
              {loading ? (
                <SearchResultsSkeleton />
              ) : hashtags.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <Hash className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No hashtags found for "{query}"</p>
                </div>
              ) : (
                <div className="space-y-2 mt-4">
                  {hashtags.map((hashtag) => (
                    <Card
                      key={hashtag.id}
                      className="p-4 cursor-pointer hover:bg-accent transition-colors active:scale-[0.99]"
                      onClick={() => navigate(`/hashtag/${hashtag.name}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Hash className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">#{hashtag.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {hashtag.posts_count.toLocaleString()} posts
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="posts" className="mt-2">
              {loading ? (
                <PostGridSkeleton />
              ) : posts.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No posts found for "{query}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1 mt-4">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      className="aspect-square overflow-hidden rounded cursor-pointer relative group"
                      onClick={() => navigate(`/post/${post.id}`)}
                    >
                      {post.media_type.startsWith("image") ? (
                        <ResponsiveImage
                          src={post.media_url}
                          alt={post.caption || "Post"}
                          className="w-full h-full transition-transform group-hover:scale-105"
                          sizes="(max-width: 640px) 33vw, 200px"
                          quality={75}
                        />
                      ) : (
                        <video
                          src={post.media_url}
                          className="w-full h-full object-cover"
                          preload="none"
                          muted
                        />
                      )}
                      {/* overlay with like count on hover */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">♥ {post.likes_count.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-4 text-center text-muted-foreground py-16">
            <SearchIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium mb-1">Find creators & content</p>
            <p className="text-sm">Search for users, #hashtags, or captions</p>
          </div>
        )}
      </div>

      {showUpload && <UploadButton onClose={() => setShowUpload(false)} />}
      <BottomNav onUploadClick={() => setShowUpload(true)} userProfile={userProfile} />
    </div>
  );
};

export default Search;
