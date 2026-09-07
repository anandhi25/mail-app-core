import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { X, Minimize2, Maximize2, Send, Paperclip, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { smtpApi } from '../lib/api';

interface ComposeModalProps {
  onClose: () => void;
}

export default function ComposeModal({ onClose }: ComposeModalProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [formData, setFormData] = useState({
    to: '',
    subject: '',
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content: '<p>Hello World! 🌎️</p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  const handleSend = async () => {
    if (!formData.to) return alert('Recipient is required');
    setIsSending(true);

    try {
      await smtpApi.sendEmail({
        to: [formData.to],
        subject: formData.subject,
        body: editor?.getHTML() || '',
        is_html: true,
      });
      alert('Email queued for sending!');
      onClose();
    } catch (error) {
      console.error(error);
      alert('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-24 w-64 bg-white rounded-t-xl shadow-2xl border border-gray-200 z-50 flex flex-col">
        <div className="bg-gray-900 text-white px-4 py-2.5 rounded-t-xl flex justify-between items-center cursor-pointer" onClick={() => setIsMinimized(false)}>
          <span className="font-medium text-sm truncate">New Message</span>
          <div className="flex gap-2">
            <button className="hover:bg-gray-700 p-1 rounded"><Maximize2 className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="hover:bg-gray-700 p-1 rounded"><X className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-24 w-[600px] bg-white rounded-t-xl shadow-[0_0_40px_rgba(0,0,0,0.15)] border border-gray-200 z-50 flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-2.5 rounded-t-xl flex justify-between items-center shrink-0">
        <span className="font-medium text-sm">New Message</span>
        <div className="flex gap-1 text-gray-400">
          <button onClick={() => setIsMinimized(true)} className="hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"><Minimize2 className="w-4 h-4" /></button>
          <button onClick={onClose} className="hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="border-b border-gray-100 px-4 py-2 flex items-center">
          <span className="text-gray-500 text-sm w-12 shrink-0">To</span>
          <input
            type="email"
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            className="flex-1 outline-none text-sm bg-transparent"
            placeholder="recipient@example.com"
          />
        </div>
        <div className="border-b border-gray-100 px-4 py-2 flex items-center">
          <span className="text-gray-500 text-sm w-12 shrink-0">Subject</span>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="flex-1 outline-none text-sm font-medium bg-transparent"
            placeholder="Subject"
          />
        </div>

        {/* Toolbar */}
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={clsx("p-1.5 rounded hover:bg-gray-200 text-gray-700 font-bold", editor?.isActive('bold') && "bg-gray-200")}
          >
            B
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={clsx("p-1.5 rounded hover:bg-gray-200 text-gray-700 italic font-serif", editor?.isActive('italic') && "bg-gray-200")}
          >
            I
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 bg-white overflow-y-auto cursor-text text-sm">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-100 p-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSending ? 'Sending...' : 'Send'}
            <Send className="w-4 h-4" />
          </button>
          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors" title="Attach files">
            <Paperclip className="w-5 h-5" />
          </button>
        </div>
        <button onClick={onClose} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Discard draft">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
