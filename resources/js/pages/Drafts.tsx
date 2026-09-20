import React, { useEffect, useState } from 'react';
import { smtpApi, imapApi } from '../lib/api';
import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Edit3, Trash2, Loader2 } from 'lucide-react';
import ComposeModal from '../components/ComposeModal';

interface Draft {
  uid: number;
  subject: string;
  to: string[];
  date: string;
}

export default function Drafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // Track selected draft metadata from list
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);

  // Track full content loaded from IMAP
  const [loadingContent, setLoadingContent] = useState(false);
  const [fullDraftContent, setFullDraftContent] = useState<{to: string, subject: string, body: string} | null>(null);

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

  const handleSelectDraft = async (draft: Draft) => {
    setSelectedUid(draft.uid);
    setActiveDraft(draft);
    setFullDraftContent(null); // clear old content
    setLoadingContent(true);

    try {
      // Fetch full body from the server using IMAP getMessageDetail endpoint
      const res = await imapApi.getMessageDetail('Drafts', draft.uid.toString());

      let toField = draft.to?.join(', ') || '';
      // Sometimes IMAP getMessageDetail returns more accurate To headers
      if (res.message?.to && Array.isArray(res.message.to)) {
          toField = res.message.to.map((t: any) => t.mail || t).join(', ');
      } else if (res.message?.to) {
          toField = res.message.to;
      }

      setFullDraftContent({
        to: toField,
        subject: res.message?.subject || draft.subject || '',
        body: res.message?.html_body || res.message?.text_body || ''
      });
    } catch (err) {
      console.error('Failed to load full draft body', err);
      // Fallback if API fails
      setFullDraftContent({
        to: draft.to?.join(', ') || '',
        subject: draft.subject,
        body: ''
      });
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDelete = async (uid: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      await smtpApi.deleteDraft(uid);
      setDrafts(prev => prev.filter(d => d.uid !== uid));
      if (selectedUid === uid) {
        setSelectedUid(null);
        setActiveDraft(null);
        setFullDraftContent(null);
      }
    } catch (err) {
      console.error('Failed to delete draft', err);
      alert('Failed to delete draft');
    }
  };

  const formatMessageDate = (dateString: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
  };

  return (
    <div className="flex h-full w-full bg-white relative">
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
      <div className="flex-1 h-full bg-white overflow-hidden flex flex-col relative z-0">
        {!activeDraft ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50/30 h-full">
            Select a draft to continue editing
          </div>
        ) : loadingContent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 h-full">
             <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
             <p>Loading draft content...</p>
          </div>
        ) : fullDraftContent ? (
          <div className="w-full h-full [&>div]:static [&>div]:h-full [&>div]:w-full [&>div]:bg-white [&>div]:border-none [&>div]:shadow-none [&>div]:rounded-none">
            {/*
              We reuse the ComposeModal but style it via parent CSS above
              to fill the entire right pane instead of acting like a popup.
            */}
            <ComposeModal
              draftUid={activeDraft.uid}
              initialTo={fullDraftContent.to}
              initialSubject={fullDraftContent.subject}
              initialBody={fullDraftContent.body}
              onClose={() => {
                // When they click X, we can just clear the selection or reload list
                setSelectedUid(null);
                setActiveDraft(null);
                loadDrafts();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
