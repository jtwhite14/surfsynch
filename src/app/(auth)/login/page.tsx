import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary">
      <SignIn appearance={{ baseTheme: dark }} />
    </div>
  );
}
