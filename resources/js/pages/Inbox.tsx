import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { imapApi } from '../lib/api';
import { Message } from '../types';
import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Paperclip, Reply, Forward, Trash2, MoreVertical } from 'lucide-react';

export default function Inbox() {
  const { folder = 'INBOX' } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);

  useEffect(() => {
    loadMessages();
  }, [folder]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      // API call to the backend we built earlier
      const res = await imapApi.getMessages(folder.toUpperCase(), 1);
      setMessages(res.messages);
      if (res.messages.length > 0 && !selectedUid) {
        handleSelectMessage(res.messages[0].uid);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMessage = async (uid: number) => {
    setSelectedUid(uid);
    setLoadingMessage(true);
    try {
      const res = await imapApi.getMessageDetail(folder.toUpperCase(), uid);
      setActiveMessage(res);
      // Update local state to mark as seen
      setMessages(prev =>
        prev.map(m => (m.uid === uid ? { ...m, is_seen: true } : m))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMessage(false);
    }
  };

  const formatMessageDate = (dateString: string) => {
    const d = new Date(dateString);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
  };

  return (
    <div className="flex h-full w-full bg-white">
      {/* Email List Panel */}
      <div className="w-1/3 min-w-[320px] max-w-[400px] border-r border-gray-200 flex flex-col h-full bg-gray-50/50">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
          <h2 className="font-semibold text-lg text-gray-800 capitalize">{folder}</h2>
          <span className="text-sm text-gray-500">{messages.length} messages</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No messages in this folder.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {messages.map((msg) => (
                <button
                  key={msg.uid}
                  onClick={() => handleSelectMessage(msg.uid)}
                  className={clsx(
                    "w-full text-left p-4 hover:bg-gray-100 transition-colors flex flex-col gap-1 relative",
                    selectedUid === msg.uid ? "bg-blue-50 hover:bg-blue-50" : "bg-white",
                    !msg.is_seen && "font-semibold"
                  )}
                >
                  {!msg.is_seen && (
                    <span className="absolute left-1.5 top-5 w-2 h-2 rounded-full bg-blue-600"></span>
                  )}
                  <div className="flex justify-between items-baseline w-full pl-2">
                    <span className="text-sm text-gray-900 truncate pr-2">{msg.from}</span>
                    <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                      {msg.has_attachments && <Paperclip className="w-3 h-3" />}
                      {formatMessageDate(msg.date)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 truncate pl-2">{msg.subject}</div>
                  <div className="text-xs text-gray-500 truncate pl-2">
                    {/* Preview text would go here */}
                    Click to read message...
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reader Panel */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {loadingMessage ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading email...</div>
        ) : !activeMessage ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50/30">
            Select an item to read
          </div>
        ) : (
          <>
            {/* Reader Header */}
            <div className="px-8 py-6 border-b border-gray-100 shrink-0">
              <div className="flex justify-between items-start mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 leading-tight">
                  {activeMessage.subject}
                </h1>
                <div className="flex gap-2">
                  <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors" title="Reply">
                    <Reply className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors" title="Forward">
                    <Forward className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors" title="Delete">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {activeMessage.from.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{activeMessage.from}</div>
                    <div className="text-xs text-gray-500">
                      to {activeMessage.to?.join(', ') || 'me'}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {format(new Date(activeMessage.date), 'MMM d, yyyy, h:mm a')}
                </div>
              </div>
            </div>

            {/* Reader Body */}
            <div className="flex-1 overflow-y-auto p-8">
              {activeMessage.body_html ? (
                <div
                  className="prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: activeMessage.body_html }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                  {activeMessage.body_text}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
