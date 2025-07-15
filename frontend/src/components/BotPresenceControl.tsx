import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <div className="container mx-auto">
      <h2 className="text-lg font-semibold mb-4">Bot Presence Control (Admin Only)</h2>
      <div className="bg-white p-6 rounded-lg shadow">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]">
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
          <div>
            <label htmlFor="activityType" className="block text-sm font-medium text-gray-700">Activity Type</label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select an activity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Playing">Playing</SelectItem>
                <SelectItem value="Streaming">Streaming</SelectItem>
                <SelectItem value="Listening">Listening</n>                <SelectItem value="Watching">Watching</SelectItem>
                <SelectItem value="Competing">Competing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="activityName" className="block text-sm font-medium text-gray-700">Activity Name</label>
            <input
              type="text"
              id="activityName"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
          </div>
          <Button type="submit">Update Presence</Button>
          {message && <p className="text-sm mt-2">{message}</p>}
        </form>
      </div>
    </div>
  );
};

export default BotPresenceControl;
