<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WebmailOutgoingEmail extends Mailable
{
    use Queueable, SerializesModels;

    public $bodyContent;
    public $isHtml;

    public function __construct(string $bodyContent, bool $isHtml = true)
    {
        $this->bodyContent = $bodyContent;
        $this->isHtml = $isHtml;
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
        return []; // Handle attachments if needed in the future
    }
}
