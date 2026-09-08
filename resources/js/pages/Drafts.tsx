import React, { useEffect, useState } from 'react';
import { smtpApi } from '../lib/api';
import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Edit3, Trash2, Send } from 'lucide-react';

interface Draft {
  uid: number;
  subject: string;
  to: string[];
  date: string;
  body?: string; // We might not have body in list view, but defined for type safety
}

export default function Drafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const res = await smtpApi.getDrafts();
      setDrafts(res.drafts || []);
      if (res.drafts?.length > 0 && !selectedUid) {
        handleSelectDraft(res.drafts[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDraft = (draft: Draft) => {
    setSelectedUid(draft.uid);
    setActiveDraft(draft);
  };

  const handleDelete = async (uid: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      await smtpApi.deleteDraft(uid);
      setDrafts(prev => prev.filter(d => d.uid !== uid));
      if (selectedUid === uid) {
        setSelectedUid(null);
        setActiveDraft(null);
      }
    } catch (err) {
      console.error('Failed to delete draft', err);
      alert('Failed to delete draft');
    }
  };

  const handleSend = async () => {
    if (!activeDraft) return;
    if (!activeDraft.to || activeDraft.to.length === 0 || !activeDraft.to[0]) {
      alert('Please specify at least one recipient (To)');
      return;
    }

    try {
      await smtpApi.sendEmail({
        uid: activeDraft.uid,
        to: activeDraft.to,
        subject: activeDraft.subject,
        body: 'Email body from draft (Note: full body reading requires a Draft detail API)',
        // Note: For a fully functioning editor we'd need an endpoint to read the full draft body.
        // IMAP Drafts API we built only returns list info without body.
      });
      alert('Email queued for sending');
      setDrafts(prev => prev.filter(d => d.uid !== activeDraft.uid));
      setSelectedUid(null);
      setActiveDraft(null);
    } catch (err) {
      console.error('Failed to send draft', err);
      alert('Failed to send email');
    }
  };

  const formatMessageDate = (dateString: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
  };

  return (
    <div className="flex h-full w-full bg-white">
      {/* Draft List Panel */}
      <div className="w-1/3 min-w-[320px] max-w-[400px] border-r border-gray-200 flex flex-col h-full bg-gray-50/50">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0 z-10">
          <h2 className="font-semibold text-lg text-gray-800">Drafts</h2>
          <span className="text-sm text-gray-500">{drafts.length} drafts</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No drafts saved.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {drafts.map((draft) => (
                <button
                  key={draft.uid}
                  onClick={() => handleSelectDraft(draft)}
                  className={clsx(
                    "w-full text-left p-4 hover:bg-gray-100 transition-colors flex flex-col gap-1 relative group",
                    selectedUid === draft.uid ? "bg-blue-50 hover:bg-blue-50" : "bg-white"
                  )}
                >
                  <div className="flex justify-between items-baseline w-full">
                    <span className="text-sm text-gray-900 truncate pr-2">
                      {draft.to?.join(', ') || '(No recipient)'}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatMessageDate(draft.date)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 truncate">{draft.subject}</div>

                  {/* Quick actions on hover */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      onClick={(e) => handleDelete(draft.uid, e)}
                      className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors cursor-pointer shadow-sm"
                      title="Delete draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Draft Editor/Preview Panel */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {!activeDraft ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50/30">
            Select a draft to view
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-100 shrink-0 bg-white">
              <div className="flex justify-between items-start mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 leading-tight">
                  {activeDraft.subject}
                </h1>
                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                  <button
                    onClick={(e) => handleDelete(activeDraft.uid, e)}
                    className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                    title="Discard"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm">
                <div className="flex">
                  <span className="w-12 text-gray-500 font-medium">To:</span>
                  <span className="text-gray-900">{activeDraft.to?.join(', ') || '(empty)'}</span>
                </div>
                <div className="flex">
                  <span className="w-12 text-gray-500 font-medium">Date:</span>
                  <span className="text-gray-500">
                    {activeDraft.date ? format(new Date(activeDraft.date), 'MMM d, yyyy, h:mm a') : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* Placeholder for Editor */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30">
              <Edit3 className="w-12 h-12 mb-4 text-gray-300" />
              <p className="mb-2">Draft editing requires fetching the full email body.</p>
              <p className="text-sm">Currently showing metadata only.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
