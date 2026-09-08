import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { imapApi, smtpApi } from '../lib/api';
import { Message, MessageAttachment } from '../types';
import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Download, Forward, MoreVertical, Paperclip, Reply, Send, Trash2, X } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

type InlineMode = 'reply' | 'forward' | null;

/** Reusable confirmation dialog */
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Delete Message</h3>
              <p className="text-sm text-gray-500 mt-1">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inbox() {
  const { folder = 'INBOX' } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [inlineTo, setInlineTo] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inlineRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedUids, setSelectedUids] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const inlineEditor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[120px] p-3 text-sm text-gray-800',
      },
    },
  });

  const resolvedFolder = useCallback(() => {
    return folder.toLowerCase() === 'inbox'
      ? 'INBOX'
      : folder.charAt(0).toUpperCase() + folder.slice(1).toLowerCase();
  }, [folder]);

  useEffect(() => {
    setMessages([]);
    setSelectedUid(null);
    setActiveMessage(null);
    setInlineMode(null);
    setPage(1);
    loadMessages(1);
  }, [folder]);

  // Scroll inline compose into view when opened
  useEffect(() => {
    if (inlineMode && inlineRef.current) {
      setTimeout(() => inlineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [inlineMode]);

  const loadMessages = async (pageToLoad: number) => {
    setLoading(true);
    try {
      const res = await imapApi.getMessages(resolvedFolder(), pageToLoad);
      setMessages(res.messages);
      setHasMore(res.messages.length === 15);
      setPage(pageToLoad);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => { if (hasMore) loadMessages(page + 1); };
  const handlePrevPage = () => { if (page > 1) loadMessages(page - 1); };

  const handleSelectMessage = async (uid: number) => {
    setSelectedUid(uid);
    setLoadingMessage(true);
    setInlineMode(null);
    try {
      const fld = resolvedFolder();
      const res = await imapApi.getMessageDetail(fld, uid);
      setActiveMessage(res);
      setMessages(prev => prev.map(m => (m.uid === uid ? { ...m, is_seen: true } : m)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMessage(false);
    }
  };

  const handleDelete = (uid: number) => {
    setConfirmDeleteUid(uid);
  };

  const confirmDelete = async () => {
    if (confirmDeleteUid === null) return;
    const uid = confirmDeleteUid;
    setConfirmDeleteUid(null);
    try {
      await imapApi.deleteMessage(resolvedFolder(), uid);
      setMessages(prev => prev.filter(m => m.uid !== uid));
      if (selectedUid === uid) { setSelectedUid(null); setActiveMessage(null); }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const toggleSelectUid = (uid: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) { next.delete(uid); } else { next.add(uid); }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUids.size === messages.length) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(messages.map(m => m.uid)));
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    setConfirmBulkDelete(false);
    try {
      const uids = Array.from(selectedUids);
      await imapApi.bulkDelete(resolvedFolder(), uids);
      setMessages(prev => prev.filter(m => !selectedUids.has(m.uid)));
      if (selectedUid !== null && selectedUids.has(selectedUid)) {
        setSelectedUid(null);
        setActiveMessage(null);
      }
      setSelectedUids(new Set());
    } catch (err) {
      console.error('Bulk delete failed', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openReply = () => {
    setInlineTo(activeMessage.from);
    const quoted = buildQuotedBlock(activeMessage);
    inlineEditor?.commands.setContent(`<p></p>${quoted}`);
    setInlineMode('reply');
  };

  const openForward = () => {
    if (!activeMessage) return;
    setInlineTo('');
    const quoted = buildForwardBlock(activeMessage);
    inlineEditor?.commands.setContent(`<p></p>${quoted}`);
    setInlineMode('forward');
  };

  const buildQuotedBlock = (msg: Message) => `
    <blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:0 12px;color:#666">
      <p style="margin:4px 0;font-size:12px">
        On ${format(new Date(msg.date), 'MMM d, yyyy, h:mm a')}, <b>${msg.from}</b> wrote:
      </p>
      ${msg.body_html || `<pre style="white-space:pre-wrap">${msg.body_text ?? ''}</pre>`}
    </blockquote>`;

  const buildForwardBlock = (msg: Message) => `
    <br>
    <p style="margin:4px 0;color:#555;font-size:12px">---------- Forwarded message ----------</p>
    <p style="margin:2px 0;font-size:12px"><b>From:</b> ${msg.from}</p>
    <p style="margin:2px 0;font-size:12px"><b>Date:</b> ${format(new Date(msg.date), 'MMM d, yyyy, h:mm a')}</p>
    <p style="margin:2px 0;font-size:12px"><b>Subject:</b> ${msg.subject}</p>
    <p style="margin:2px 0;font-size:12px"><b>To:</b> ${msg.to?.join(', ') ?? ''}</p>
    <br>
    ${msg.body_html || `<pre style="white-space:pre-wrap">${msg.body_text ?? ''}</pre>`}`;

  const handleInlineSend = async () => {
    if (!activeMessage || !inlineTo.trim()) return alert('Recipient is required');
    setIsSending(true);
    try {
      const subject = inlineMode === 'reply'
        ? (activeMessage.subject.startsWith('Re:') ? activeMessage.subject : `Re: ${activeMessage.subject}`)
        : `Fwd: ${activeMessage.subject}`;

      await smtpApi.sendEmail({
        to: [inlineTo],
        subject,
        body: inlineEditor?.getHTML() ?? '',
        is_html: true,
      });

      alert('Email queued for sending!');
      setInlineMode(null);
      inlineEditor?.commands.clearContent();
    } catch (err) {
      alert('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const downloadAttachment = (att: MessageAttachment) => {
    const bytes = atob(att.content);
    const blob = new Blob([new Uint8Array([...bytes].map(c => c.charCodeAt(0)))], { type: att.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = att.name; a.click();
    URL.revokeObjectURL(url);
  };

  const formatMessageDate = (d: string) => {
    const date = new Date(d);
    return isToday(date) ? format(date, 'HH:mm') : format(date, 'MMM d');
  };

  return (
    <div className="flex h-full w-full bg-white">
      {confirmDeleteUid !== null && (
        <ConfirmDialog
          message={resolvedFolder() === 'Trash' ? 'Pesan ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan!' : 'Pesan ini akan dipindahkan ke Trash. Lanjutkan?'}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteUid(null)}
        />
      )}
      {confirmBulkDelete && (
        <ConfirmDialog
          message={resolvedFolder() === 'Trash' ? `${selectedUids.size} pesan akan dihapus permanen. Tindakan ini tidak dapat dibatalkan!` : `${selectedUids.size} pesan akan dipindahkan ke Trash. Lanjutkan?`}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
      {/* Email List Panel */}
      <div className="w-1/3 min-w-[320px] max-w-[400px] border-r border-gray-200 flex flex-col h-full bg-gray-50/50">
        <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          {selectedUids.size > 0 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedUids.size === messages.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">{selectedUids.size} selected</span>
              </div>
              <button
                onClick={() => setConfirmBulkDelete(true)}
                disabled={isBulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isBulkDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={messages.length > 0 && selectedUids.size === messages.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
                <h2 className="font-semibold text-lg text-gray-800 capitalize">{folder}</h2>
              </div>
              <span className="text-sm text-gray-500">{messages.length} messages</span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No messages in this folder.</div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="divide-y divide-gray-100 flex-1">
                {messages.map(msg => (
                  <div
                    key={msg.uid}
                    onClick={() => handleSelectMessage(msg.uid)}
                    className={clsx(
                      'w-full text-left px-3 py-3 hover:bg-gray-100 transition-colors flex items-start gap-2 relative group cursor-pointer',
                      selectedUid === msg.uid ? 'bg-blue-50 hover:bg-blue-50' : 'bg-white',
                      selectedUids.has(msg.uid) && 'bg-blue-50/60',
                      !msg.is_seen && 'font-semibold'
                    )}
                  >
                    {/* Checkbox */}
                    <div className="shrink-0 pt-1" onClick={e => toggleSelectUid(msg.uid, e)}>
                      <input
                        type="checkbox"
                        checked={selectedUids.has(msg.uid)}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {!msg.is_seen && <span className="absolute left-9 top-5 w-2 h-2 rounded-full bg-blue-600" />}
                      <div className="flex justify-between items-baseline w-full pl-1">
                        <span className="text-sm text-gray-900 truncate pr-2">{msg.from}</span>
                        <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                          {msg.has_attachments && <Paperclip className="w-3 h-3" />}
                          {formatMessageDate(msg.date)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-800 truncate pl-1">{msg.subject}</div>
                      <div className="text-xs text-gray-500 truncate pl-1">Click to read message...</div>
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div onClick={e => { e.stopPropagation(); handleDelete(msg.uid); }}
                        className="p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-100 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between sticky bottom-0 z-10">
                <button
                  onClick={handlePrevPage}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  &larr; Prev
                </button>
                <span className="text-xs text-gray-500">Page {page}</span>
                <button
                  onClick={handleNextPage}
                  disabled={!hasMore}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next &rarr;
                </button>
              </div>
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
          <div className="flex-1 overflow-y-auto">
            {/* Reader Header */}
            <div className="px-8 py-6 border-b border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 leading-tight pr-4">
                  {activeMessage.subject}
                </h1>
                <div className="flex gap-2 shrink-0">
                  <button onClick={openReply}
                    className={clsx('p-2 rounded-md transition-colors', inlineMode === 'reply' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100')}
                    title="Reply">
                    <Reply className="w-5 h-5" />
                  </button>
                  <button onClick={openForward}
                    className={clsx('p-2 rounded-md transition-colors', inlineMode === 'forward' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100')}
                    title="Forward">
                    <Forward className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(activeMessage.uid)}
                    className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors" title="Delete">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
                    {activeMessage.from.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{activeMessage.from}</div>
                    <div className="text-xs text-gray-500">to {activeMessage.to?.join(', ') || 'me'}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 shrink-0">
                  {format(new Date(activeMessage.date), 'MMM d, yyyy, h:mm a')}
                </div>
              </div>
            </div>

            {/* Reader Body */}
            <div className="px-8 py-6">
              {activeMessage.body_html ? (
                <div className="prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: activeMessage.body_html }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{activeMessage.body_text}</pre>
              )}

              {/* Attachments */}
              {activeMessage.attachments && activeMessage.attachments.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    {activeMessage.attachments.length} Attachment{activeMessage.attachments.length > 1 ? 's' : ''}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {activeMessage.attachments.map((att, i) => (
                      <button key={i} onClick={() => downloadAttachment(att)}
                        className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors text-sm group">
                        <Paperclip className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                        <span className="text-gray-800 max-w-[180px] truncate">{att.name}</span>
                        <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inline Reply / Forward Compose — appears below email body */}
            {inlineMode && (
              <div ref={inlineRef} className="mx-8 mb-8 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Compose header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-700 capitalize">
                    {inlineMode === 'reply' ? '↩ Reply' : '↪ Forward'}
                  </span>
                  <button onClick={() => setInlineMode(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* To field */}
                <div className="flex items-center px-4 py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 w-8 shrink-0">To</span>
                  <input
                    type="email"
                    value={inlineTo}
                    onChange={e => setInlineTo(e.target.value)}
                    className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
                    placeholder="recipient@example.com"
                    autoFocus
                  />
                </div>

                {/* TipTap Editor */}
                <div className="bg-white cursor-text" onClick={() => inlineEditor?.commands.focus()}>
                  <EditorContent editor={inlineEditor} />
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={handleInlineSend}
                    disabled={isSending}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                  <button onClick={() => setInlineMode(null)} className="text-sm text-gray-500 hover:text-gray-700">
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
