// ErrorBoundary is the ONE exception to the "no class components" rule.
// React's error boundary API requires getDerivedStateFromError, which only
// works in class components. There is no functional equivalent.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <View style={styles.container}>
          <Text style={styles.text}>Something went wrong.</Text>
          <Pressable
            style={styles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.buttonText}>Tap to retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F5F5F0', padding: 20,
  },
  text: { fontSize: 24, fontWeight: '500', color: '#1A1A1A', marginBottom: 24 },
  button: {
    backgroundColor: '#FFFFFF', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 12, borderWidth: 1, borderColor: '#D5D5D0',
  },
  buttonText: { fontSize: 20, fontWeight: '600', color: '#1A1A1A' },
});
