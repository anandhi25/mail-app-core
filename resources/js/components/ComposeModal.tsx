import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle, Color, FontFamily } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import {
  X, Minimize2, Maximize2, Send, Paperclip, Trash2, Cloud, HardDrive,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link2, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Code, Minus, Table as TableIcon,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon, Highlighter,
  Undo, Redo, ChevronDown, Type,
} from 'lucide-react';
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

// Global interface for Dropbox / Google Picker
declare global {
  interface Window {
    Dropbox?: any;
    gapi?: any;
    google?: any;
  }
}

/** Small toolbar button with active-state highlighting. */
function ToolbarButton({
  onClick,
  isActive = false,
  title,
  children,
  className = '',
}: {
  onClick: () => void;
  isActive?: boolean;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={clsx(
        'p-1.5 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors',
        isActive && 'bg-blue-100 text-blue-700',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Thin vertical divider between toolbar groups. */
function Divider() {
  return <span className="w-px h-5 bg-gray-200 mx-1 self-center" />;
}

export default function ComposeModal({
  onClose,
  initialTo = '',
  initialSubject = '',
  initialBody,
}: ComposeModalProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showFontFamily, setShowFontFamily] = useState(false);
  const [showHeadings, setShowHeadings] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    to: initialTo,
    cc: '',
    bcc: '',
    subject: initialSubject,
  });
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const FONT_FAMILIES = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact'];
  const FONT_SIZES = ['10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];
  const TEXT_COLORS = [
    '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
    '#ff0000', '#ff4500', '#ff7f00', '#ffd700', '#008000', '#0000ff', '#4b0082', '#ee82ee',
    '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  ];
  const HIGHLIGHT_COLORS = [
    '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff0000', '#0000ff',
    '#ffd966', '#93c47d', '#76a5af', '#8e7cc3', '#e06666', '#f9cb9c',
  ];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        // Configure Link (included in StarterKit v3)
        link: { openOnClick: false, autolink: true },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph', 'image'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Subscript,
      Superscript,
      FontFamily,
    ],
    content: initialBody ?? '<p></p>',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[280px] p-4 prose prose-sm max-w-none',
      },
    },
  });

  // --- Cloud Integrations Script Loaders ---
  useEffect(() => {
    if (!document.getElementById('dropboxjs')) {
      const script = document.createElement('script');
      script.id = 'dropboxjs';
      script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
      script.setAttribute('data-app-key', 'YOUR_DROPBOX_APP_KEY');
      document.body.appendChild(script);
    }
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = () => {
      setShowAttachMenu(false);
      setShowColorPicker(false);
      setShowHighlightPicker(false);
      setShowFontFamily(false);
      setShowHeadings(false);
      setShowFontSize(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = async () => {
    if (!formData.to) {
      return alert('Recipient is required');
    }
    setIsSending(true);
    try {
      await smtpApi.sendEmail({
        to: [formData.to],
        subject: formData.subject,
        body: editor?.getHTML() || '',
        is_html: true,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          content: a.content,
        })),
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
    if (!formData.to && !formData.subject && editor?.isEmpty) {
      return;
    }
    try {
      await smtpApi.saveDraft({
        to: formData.to ? [formData.to] : [],
        subject: formData.subject,
        body: editor?.getHTML() || '',
        is_html: true,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          content: a.content,
        })),
      });
    } catch (error) {
      console.error('Failed to save draft', error);
    }
  };

  const handleClose = () => {
    const hasContent = formData.to || formData.subject || (editor && !editor.isEmpty) || attachments.length > 0;
    if (hasContent && confirm('Save to drafts?')) {
      handleSaveDraft();
    }
    onClose();
  };

  // --- Local Attachments ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) {
      return;
    }
    setShowAttachMenu(false);
    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Max 5MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachments((prev) => [
            ...prev,
            {
              filename: file.name,
              mime_type: file.type || 'application/octet-stream',
              content: event.target!.result as string,
              size: file.size,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /** Insert an image from local disk directly into editor body. */
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !editor) {
      return;
    }
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          editor.chain().focus().setImage({ src: event.target.result as string, alt: file.name }).run();
        }
      };
      reader.readAsDataURL(file);
    });
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Link ---
  const applyLink = () => {
    if (!linkUrl) {
      editor?.chain().focus().unsetLink().run();
    } else {
      const href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor?.chain().focus().setLink({ href }).run();
    }
    setShowLinkPopover(false);
    setLinkUrl('');
  };

  // --- Image URL ---
  const applyImageUrl = () => {
    if (imageUrl && editor) {
      const src = imageUrl.startsWith('http') ? imageUrl : `https://${imageUrl}`;
      editor.chain().focus().setImage({ src }).run();
    }
    setShowImagePopover(false);
    setImageUrl('');
  };

  // --- Table ---
  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  // --- Dropbox ---
  const handleDropbox = () => {
    setShowAttachMenu(false);
    if (!window.Dropbox) {
      return alert('Dropbox is not loaded yet');
    }
    window.Dropbox.choose({
      success: (files: any[]) => {
        let htmlToAdd = '<br><p><strong>Dropbox Attachments:</strong></p><ul>';
        files.forEach((file) => {
          htmlToAdd += `<li><a href="${file.link}" target="_blank">${file.name}</a> (${Math.round(file.bytes / 1024)} KB)</li>`;
        });
        htmlToAdd += '</ul><br>';
        editor?.commands.insertContent(htmlToAdd);
      },
      cancel: () => {},
      linkType: 'preview',
      multiselect: true,
    });
  };

  // --- Google Drive ---
  const handleGoogleDrive = () => {
    setShowAttachMenu(false);
    if (!window.google || !window.google.picker) {
      return alert('Google Picker is not loaded yet');
    }
    const oauthToken = 'YOUR_GOOGLE_OAUTH_TOKEN';
    try {
      const picker = new window.google.picker.PickerBuilder()
        .addView(window.google.picker.ViewId.DOCS)
        .setOAuthToken(oauthToken)
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
    } catch {
      alert('Google Picker requires valid OAuth configuration to render.');
    }
  };

  const currentHeadingLabel = (() => {
    if (editor?.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor?.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor?.isActive('heading', { level: 3 })) return 'Heading 3';
    if (editor?.isActive('heading', { level: 4 })) return 'Heading 4';
    if (editor?.isActive('heading', { level: 5 })) return 'Heading 5';
    if (editor?.isActive('heading', { level: 6 })) return 'Heading 6';
    return 'Paragraph';
  })();

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-24 w-64 bg-white rounded-t-xl shadow-2xl border border-gray-200 z-50">
        <div
          className="bg-gray-900 text-white px-4 py-2.5 rounded-t-xl flex justify-between items-center cursor-pointer"
          onClick={() => setIsMinimized(false)}
        >
          <span className="font-medium text-sm truncate">New Message</span>
          <div className="flex gap-2">
            <button className="hover:bg-gray-700 p-1 rounded">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="hover:bg-gray-700 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-24 w-[780px] bg-white rounded-t-xl shadow-[0_0_40px_rgba(0,0,0,0.18)] border border-gray-200 z-50 flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-2.5 rounded-t-xl flex justify-between items-center shrink-0">
        <span className="font-medium text-sm">New Message</span>
        <div className="flex gap-1 text-gray-400">
          <button
            onClick={() => setIsMinimized(true)}
            className="hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="shrink-0">
        {/* To */}
        <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-2">
          <span className="text-gray-500 text-xs w-10 shrink-0">To</span>
          <input
            type="email"
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            className="flex-1 outline-none text-sm bg-transparent"
            placeholder="recipient@example.com"
          />
          <div className="flex gap-2 text-xs text-blue-500 shrink-0">
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="hover:underline">
                Cc
              </button>
            )}
            {!showBcc && (
              <button onClick={() => setShowBcc(true)} className="hover:underline">
                Bcc
              </button>
            )}
          </div>
        </div>

        {/* Cc */}
        {showCc && (
          <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-gray-500 text-xs w-10 shrink-0">Cc</span>
            <input
              type="email"
              value={formData.cc}
              onChange={(e) => setFormData({ ...formData, cc: e.target.value })}
              className="flex-1 outline-none text-sm bg-transparent"
              placeholder="cc@example.com"
              autoFocus
            />
          </div>
        )}

        {/* Bcc */}
        {showBcc && (
          <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-gray-500 text-xs w-10 shrink-0">Bcc</span>
            <input
              type="email"
              value={formData.bcc}
              onChange={(e) => setFormData({ ...formData, bcc: e.target.value })}
              className="flex-1 outline-none text-sm bg-transparent"
              placeholder="bcc@example.com"
              autoFocus
            />
          </div>
        )}

        {/* Subject */}
        <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-2">
          <span className="text-gray-500 text-xs w-10 shrink-0">Subject</span>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="flex-1 outline-none text-sm font-medium bg-transparent"
            placeholder="Subject"
          />
        </div>
      </div>

      {/* ─── Full Toolbar ─── */}
      <div
        className="bg-gray-50 border-b border-gray-200 px-2 py-1.5 shrink-0 flex flex-wrap gap-0.5 items-center select-none"
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* Undo / Redo */}
        <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
          <Undo className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} title="Redo (Ctrl+Y)">
          <Redo className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Heading / Paragraph selector */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowHeadings((v) => !v);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-200 transition-colors min-w-[90px]"
            title="Paragraph style"
          >
            <Type className="w-3 h-3" />
            <span className="truncate">{currentHeadingLabel}</span>
            <ChevronDown className="w-3 h-3 ml-auto" />
          </button>
          {showHeadings && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 py-1 w-36">
              {(['Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'] as const).map((label) => {
                const level = label === 'Paragraph' ? 0 : parseInt(label.split(' ')[1]);
                return (
                  <button
                    key={label}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (level === 0) {
                        editor?.chain().focus().setParagraph().run();
                      } else {
                        editor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                      }
                      setShowHeadings(false);
                    }}
                    className={clsx(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors',
                      level === 1 && 'font-bold text-base',
                      level === 2 && 'font-bold text-sm',
                      level === 3 && 'font-semibold text-sm',
                      level === 4 && 'font-semibold',
                      currentHeadingLabel === label && 'bg-blue-50 text-blue-700',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Font Family */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowFontFamily((v) => !v);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-200 transition-colors min-w-[80px]"
            title="Font family"
          >
            <span className="truncate">Font</span>
            <ChevronDown className="w-3 h-3 ml-auto" />
          </button>
          {showFontFamily && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 py-1 w-40">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor?.chain().focus().setFontFamily(font).run();
                    setShowFontFamily(false);
                  }}
                  style={{ fontFamily: font }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors"
                >
                  {font}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Bold, Italic, Underline, Strikethrough */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={editor?.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={editor?.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          isActive={editor?.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          isActive={editor?.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleSubscript().run()}
          isActive={editor?.isActive('subscript')}
          title="Subscript"
        >
          <SubscriptIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleSuperscript().run()}
          isActive={editor?.isActive('superscript')}
          title="Superscript"
        >
          <SuperscriptIcon className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Text Color */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowColorPicker((v) => !v);
              setShowHighlightPicker(false);
            }}
            title="Text color"
            className="flex flex-col items-center p-1.5 rounded hover:bg-gray-200 transition-colors gap-0.5"
          >
            <span className="text-xs font-bold text-gray-700 leading-none">A</span>
            <span className="w-4 h-1 rounded-sm bg-red-500 block" />
          </button>
          {showColorPicker && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 p-2"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-gray-500 mb-1.5 px-1">Text Color</p>
              <div className="grid grid-cols-8 gap-1">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor?.chain().focus().setColor(color).run();
                      setShowColorPicker(false);
                    }}
                    style={{ backgroundColor: color }}
                    className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor?.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="mt-1.5 w-full text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded py-0.5"
              >
                Remove color
              </button>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowHighlightPicker((v) => !v);
              setShowColorPicker(false);
            }}
            title="Highlight"
            className={clsx(
              'flex flex-col items-center p-1.5 rounded hover:bg-gray-200 transition-colors gap-0.5',
              editor?.isActive('highlight') && 'bg-blue-100',
            )}
          >
            <Highlighter className="w-3.5 h-3.5 text-gray-700" />
            <span className="w-4 h-1 rounded-sm bg-yellow-300 block" />
          </button>
          {showHighlightPicker && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 p-2"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-gray-500 mb-1.5 px-1">Highlight Color</p>
              <div className="grid grid-cols-6 gap-1">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor?.chain().focus().setHighlight({ color }).run();
                      setShowHighlightPicker(false);
                    }}
                    style={{ backgroundColor: color }}
                    className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
                    title={color}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor?.chain().focus().unsetHighlight().run();
                  setShowHighlightPicker(false);
                }}
                className="mt-1.5 w-full text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded py-0.5"
              >
                Remove highlight
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          isActive={editor?.isActive({ textAlign: 'left' })}
          title="Align left"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          isActive={editor?.isActive({ textAlign: 'center' })}
          title="Align center"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          isActive={editor?.isActive({ textAlign: 'right' })}
          title="Align right"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
          isActive={editor?.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={editor?.isActive('bulletList')}
          title="Bullet list"
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={editor?.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Blockquote, Code, HRule */}
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          isActive={editor?.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          isActive={editor?.isActive('codeBlock')}
          title="Code block"
        >
          <Code className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Link */}
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              setLinkUrl(editor?.getAttributes('link').href ?? '');
              setShowLinkPopover((v) => !v);
            }}
            isActive={editor?.isActive('link')}
            title="Insert link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          {showLinkPopover && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 p-3 w-64"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-gray-700 mb-1.5">Insert Link</p>
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyLink()}
                placeholder="https://example.com"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400 mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyLink();
                  }}
                  className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 transition-colors"
                >
                  Apply
                </button>
                {editor?.isActive('link') && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().unsetLink().run();
                      setShowLinkPopover(false);
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 text-xs py-1.5 rounded hover:bg-gray-200 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Image (inline) */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowImagePopover((v) => !v)}
            title="Insert image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          {showImagePopover && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 p-3 w-64"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-gray-700 mb-1.5">Insert Image</p>

              {/* From URL */}
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyImageUrl()}
                placeholder="https://example.com/image.jpg"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400 mb-2"
                autoFocus
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyImageUrl();
                }}
                className="w-full bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 transition-colors mb-2"
              >
                Insert from URL
              </button>

              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
                <span className="flex-1 border-t border-gray-200" />
                or
                <span className="flex-1 border-t border-gray-200" />
              </div>

              {/* From local disk */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  imageInputRef.current?.click();
                  setShowImagePopover(false);
                }}
                className="w-full bg-gray-100 text-gray-700 text-xs py-1.5 rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
              >
                <HardDrive className="w-3 h-3" />
                Upload from device
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <ToolbarButton onClick={insertTable} title="Insert 3×3 table">
          <TableIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto bg-white cursor-text flex flex-col relative">
        <EditorContent editor={editor} className="flex-1" />

        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 bg-gray-50/50">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs shadow-sm"
              >
                <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="truncate max-w-[140px] font-medium" title={file.filename}>
                  {file.filename}
                </span>
                <span className="text-gray-400">({Math.round(file.size / 1024)}kb)</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="text-gray-400 hover:text-red-500 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-100 p-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          {/* Send */}
          <button
            onClick={handleSend}
            disabled={isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSending ? 'Sending...' : 'Send'}
            <Send className="w-4 h-4" />
          </button>

          {/* Attach */}
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu((v) => !v)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
              title="Attach files"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-200 shadow-lg rounded-lg py-1 z-50">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  Local File
                </button>
                <button
                  onClick={handleDropbox}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Cloud className="w-4 h-4 text-blue-500" />
                  Dropbox
                </button>
                <button
                  onClick={handleGoogleDrive}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Cloud className="w-4 h-4 text-green-500" />
                  Google Drive
                </button>
              </div>
            )}
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <input type="file" accept="image/*" multiple className="hidden" ref={imageInputRef} onChange={handleImageFileChange} />
          </div>
        </div>

        {/* Discard */}
        <button
          onClick={handleClose}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          title="Discard draft"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
