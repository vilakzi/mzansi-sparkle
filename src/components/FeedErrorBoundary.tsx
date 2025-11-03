import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class FeedErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Feed error caught:', error, errorInfo);
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md text-center space-y-6 animate-fade-in">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred while loading the feed'}
              </p>
            </div>

            <Button
              onClick={this.handleReset}
              className="w-full touch-manipulation"
              size="lg"
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Reload Feed
            </Button>

            {this.state.errorCount > 2 && (
              <p className="text-sm text-muted-foreground">
                If this problem persists, try clearing your browser cache or contact support.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
