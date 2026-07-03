import { LoginForm } from "@/components/auth/login-form";

// Read at request time so DEMO_PREFILL toggles without a rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const prefill = process.env.DEMO_PREFILL === "true";
  return (
    <LoginForm
      defaultEmail={prefill ? "james.wilson@cah.local" : ""}
      defaultPassword={prefill ? "demo1234" : ""}
      prefilled={prefill}
    />
  );
}
