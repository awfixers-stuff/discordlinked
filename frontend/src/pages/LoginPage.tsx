
import { Button } from '@/components/ui/button';

const LoginPage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl font-bold mb-4">Discord Linked</h1>
      <p className="text-gray-600 mb-8">Please log in with Discord to continue</p>
      <Button asChild>
        <a href="/auth/discord">Log in with Discord</a>
      </Button>
    </div>
  );
};

export default LoginPage;
