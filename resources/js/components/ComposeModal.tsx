import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { X, Minimize2, Maximize2, Send, Paperclip, Trash2, Cloud, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import { smtpApi } from '../lib/api';

interface ComposeModalProps {
  onClose: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}

interface Attachment {
  filename: string;
  mime_type: string;
  content: string; // base64
  size: number;
}

// Global interface for Dropbox
declare global {
  interface Window {
    Dropbox?: any;
    gapi?: any;
    google?: any;
  }
}

export default function ComposeModal({ onClose, initialTo = '', initialSubject = '', initialBody }: ComposeModalProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    to: initialTo,
    subject: initialSubject,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content: initialBody ?? '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  // --- Cloud Integrations Script Loaders ---
  useEffect(() => {
    // Load Dropbox
    if (!document.getElementById('dropboxjs')) {
      const script = document.createElement('script');
      script.id = 'dropboxjs';
      script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
      // Replace with your actual Dropbox App Key
      script.setAttribute('data-app-key', 'YOUR_DROPBOX_APP_KEY');
      document.body.appendChild(script);
    }

    // Load Google Picker API
    if (!document.getElementById('googleapi')) {
      const script = document.createElement('script');
      script.id = 'googleapi';
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', { callback: () => console.log('Google Picker Loaded') });
      };
      document.body.appendChild(script);
    }
  }, []);

  const handleSend = async () => {
    if (!formData.to) return alert('Recipient is required');
    setIsSending(true);

    try {
      await smtpApi.sendEmail({
        to: [formData.to],
        subject: formData.subject,
        body: editor?.getHTML() || '',
        is_html: true,
        attachments: attachments.map(a => ({
          filename: a.filename,
          mime_type: a.mime_type,
          content: a.content
        }))
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

  const handleSaveDraft = async () => {
    if (!formData.to && !formData.subject && editor?.isEmpty) return;

    try {
      await smtpApi.saveDraft({
        to: formData.to ? [formData.to] : [],
        subject: formData.subject,
        body: editor?.getHTML() || '',
        is_html: true,
        attachments: attachments.map(a => ({
          filename: a.filename,
          mime_type: a.mime_type,
          content: a.content
        }))
      });
      console.log('Draft saved');
    } catch (error) {
      console.error('Failed to save draft', error);
    }
  };

  const handleClose = () => {
    if (formData.to || formData.subject || (editor && !editor.isEmpty) || attachments.length > 0) {
      if (confirm('Save to drafts?')) {
        handleSaveDraft();
      }
    }
    onClose();
  };

  // --- Local Attachments ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setShowAttachMenu(false);

    Array.from(files).forEach(file => {
      // 5MB limit for base64 local attachments
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Max 5MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachments(prev => [...prev, {
            filename: file.name,
            mime_type: file.type || 'application/octet-stream',
            content: event.target!.result as string,
            size: file.size
          }]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- Dropbox Integrations ---
  const handleDropbox = () => {
    setShowAttachMenu(false);
    if (!window.Dropbox) return alert('Dropbox is not loaded yet');

    window.Dropbox.choose({
      success: (files: any[]) => {
        // Insert Dropbox links into the email body
        let htmlToAdd = '<br><p><strong>Dropbox Attachments:</strong></p><ul>';
        files.forEach(file => {
          htmlToAdd += `<li><a href="${file.link}" target="_blank">${file.name}</a> (${Math.round(file.bytes/1024)} KB)</li>`;
        });
        htmlToAdd += '</ul><br>';

        editor?.commands.insertContent(htmlToAdd);
      },
      cancel: () => {},
      linkType: "preview",
      multiselect: true,
    });
  };

  // --- Google Drive Integrations ---
  const handleGoogleDrive = () => {
    setShowAttachMenu(false);
    if (!window.google || !window.google.picker) return alert('Google Picker is not loaded yet');

    // Note: A real app needs an OAuth token here.
    // This is a stub implementation of the picker UI.
    const oauthToken = 'YOUR_GOOGLE_OAUTH_TOKEN';

    try {
      const picker = new window.google.picker.PickerBuilder()
        .addView(window.google.picker.ViewId.DOCS)
        .setOAuthToken(oauthToken)
        // .setDeveloperKey('YOUR_API_KEY')
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            let htmlToAdd = '<br><p><strong>Google Drive Attachments:</strong></p><ul>';
            data.docs.forEach((doc: any) => {
              htmlToAdd += `<li><a href="${doc.url}" target="_blank">${doc.name}</a></li>`;
            });
            htmlToAdd += '</ul><br>';
            editor?.commands.insertContent(htmlToAdd);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      alert("Google Picker requires valid OAuth configuration to render.");
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-24 w-64 bg-white rounded-t-xl shadow-2xl border border-gray-200 z-50 flex flex-col">
        <div className="bg-gray-900 text-white px-4 py-2.5 rounded-t-xl flex justify-between items-center cursor-pointer" onClick={() => setIsMinimized(false)}>
          <span className="font-medium text-sm truncate">New Message</span>
          <div className="flex gap-2">
            <button className="hover:bg-gray-700 p-1 rounded"><Maximize2 className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="hover:bg-gray-700 p-1 rounded"><X className="w-4 h-4" /></button>
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
          <button onClick={handleClose} className="hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto flex flex-col relative">
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
        <div className="flex-1 bg-white overflow-y-auto cursor-text text-sm flex flex-col">
          <EditorContent editor={editor} className="flex-1" />

          {/* Attachments Preview Area */}
          {attachments.length > 0 && (
            <div className="p-4 border-t border-gray-50 flex flex-wrap gap-2 bg-gray-50/50 mt-auto">
              {attachments.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs shadow-sm">
                  <span className="truncate max-w-[150px] font-medium" title={file.filename}>{file.filename}</span>
                  <span className="text-gray-400">({Math.round(file.size / 1024)}kb)</span>
                  <button onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-100 p-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleSend}
            disabled={isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSending ? 'Sending...' : 'Send'}
            <Send className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
              title="Attach files"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-200 shadow-lg rounded-lg py-1 z-50">
                <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  Local File
                </button>
                <button onClick={handleDropbox} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-500" />
                  Dropbox
                </button>
                <button onClick={handleGoogleDrive} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-green-500" />
                  Google Drive
                </button>
              </div>
            )}

            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>
        </div>

        <button onClick={handleClose} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Discard draft">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
