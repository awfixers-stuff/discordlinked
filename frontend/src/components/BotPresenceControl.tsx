import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const BotPresenceControl = () => {
  const [status, setStatus] = useState('online');
  const [activityType, setActivityType] = useState('Playing');
  const [activityName, setActivityName] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    try {
      const response = await fetch('/api/bot/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          activityType,
          activityName,
        }),
      });

      const data = await response.text();
      if (response.ok) {
        setMessage(`Success: ${data}`);
      } else {
        setMessage(`Error: ${data}`);
      }
    } catch (error) {
      console.error('Failed to send update:', error);
      setMessage('Error: Could not connect to the server.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot Presence Control</CardTitle>
        <CardDescription>Update the bot's presence on Discord. This is an admin-only feature.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="dnd">Do Not Disturb</SelectItem>
                <SelectItem value="invisible">Invisible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="activityType">Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select an activity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Playing">Playing</SelectItem>
                <SelectItem value="Streaming">Streaming</SelectItem>
                <SelectItem value="Listening">Listening</SelectItem>
                <SelectItem value="Watching">Watching</SelectItem>
                <SelectItem value="Competing">Competing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="activityName">Activity Name</Label>
            <Input
              id="activityName"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="What is the bot doing?"
            />
          </div>
        </form>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleSubmit}>Update Presence</Button>
        {message && <p className="text-sm ml-4">{message}</p>}
      </CardFooter>
    </Card>
  );
};

export default BotPresenceControl;
