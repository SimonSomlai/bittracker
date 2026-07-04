import type { ReactNode } from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { ToastContext, useToastState } from "@/components/ui/use-toast";

export function Toaster({ children }: { children: ReactNode }) {
  const { messages, toast } = useToastState();

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastProvider>
        {messages.map((message) => (
          <Toast key={message.id} open>
            <div className="grid gap-1">
              <ToastTitle>{message.title}</ToastTitle>
              {message.description ? (
                <ToastDescription>{message.description}</ToastDescription>
              ) : null}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}
