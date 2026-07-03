"use client"

import { ToastProvider } from "@/components/ui/toast"
import { CommandPalette, useCommandPalette } from "@/components/ui/command-palette"
import { KeyboardShortcutsPanel } from "@/components/ui/keyboard-shortcuts"
import { OnboardingProvider } from "@/lib/onboarding/use-onboarding"
import { SessionProvider } from "@/lib/auth/use-session"
import { CelebrationModal } from "@/components/onboarding/celebration-modal"

export function Providers({ children }: { children: React.ReactNode }) {
  const { commands } = useCommandPalette()

  return (
    <ToastProvider>
      <SessionProvider>
        <OnboardingProvider>
          {children}
          <CelebrationModal />
        </OnboardingProvider>
      </SessionProvider>
      <CommandPalette commands={commands} />
      <KeyboardShortcutsPanel />
    </ToastProvider>
  )
}
