import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  postId: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-post error boundary to isolate crashes
 * If one post fails, others continue to work
 */
export class PostErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in post ${this.props.postId}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="w-full h-screen snap-start flex items-center justify-center bg-muted/50">
          <div className="text-center p-6 space-y-3">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              Unable to load this post
            </p>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
