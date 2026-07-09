import * as React from "react";

type ToastMessage = {
  id: number;
  title: string;
  description?: string;
};

type ToastContextValue = {
  toast: (message: Omit<ToastMessage, "id">) => void;
};

export const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within Toaster");
  }
  return context;
}

export function useToastState() {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);
  const toast = React.useCallback((message: Omit<ToastMessage, "id">) => {
    setMessages([{ ...message, id: Date.now() }]);
  }, []);

  React.useEffect(() => {
    if (messages.length === 0) return;
    const timer = window.setTimeout(() => {
      setMessages((current) => current.slice(1));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [messages]);

  return { messages, toast };
}
