<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WebmailOutgoingEmail extends Mailable
{
    use Queueable, SerializesModels;

    public $bodyContent;

    public $isHtml;

    public $fileAttachments;

    public function __construct(string $bodyContent, bool $isHtml = true, array $fileAttachments = [])
    {
        $this->bodyContent = $bodyContent;
        $this->isHtml = $isHtml;
        $this->fileAttachments = $fileAttachments;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->subject,
        );
    }

    public function content(): Content
    {
        // Using view or raw html depending on isHtml
        if ($this->isHtml) {
            return new Content(
                htmlString: $this->bodyContent,
            );
        }

        return new Content(
            textString: $this->bodyContent,
        );
    }

    public function attachments(): array
    {
        $attachments = [];

        foreach ($this->fileAttachments as $file) {
            if (! empty($file['content']) && ! empty($file['filename'])) {
                // Decode base64 content
                $decoded = base64_decode(preg_replace('#^data:[\w/\-]+;base64,#i', '', $file['content']));

                $attachments[] = Attachment::fromData(
                    fn () => $decoded,
                    $file['filename']
                )->withMime($file['mime_type'] ?? 'application/octet-stream');
            }
        }

        return $attachments;
    }
}
