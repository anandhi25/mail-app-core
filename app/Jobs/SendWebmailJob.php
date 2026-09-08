<?php

namespace App\Jobs;

use App\Mail\WebmailOutgoingEmail;
use App\Services\DraftService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Webklex\IMAP\Facades\Client;

class SendWebmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly string $senderEmail,
        public readonly string $senderPassword,
        public readonly array $to,
        public readonly array $cc = [],
        public readonly array $bcc = [],
        public readonly ?string $subject = null,
        public readonly ?string $body = null,
        public readonly bool $isHtml = true,
        public readonly ?int $draftUid = null,
        public readonly array $attachments = [],
        public readonly ?string $senderName = null,
    ) {}

    public function handle(): void
    {
        // Jika Relay / SmartHost aktif, gunakan credentials dari admin settings.
        // Jika tidak aktif (Local SMTP via Postfix), gunakan email & password user.
        if (config('mail.relay_enabled', false)) {
            Config::set('mail.mailers.smtp.username', config('mail.relay_username'));
            Config::set('mail.mailers.smtp.password', config('mail.relay_password'));
        } else {
            Config::set('mail.mailers.smtp.username', $this->senderEmail);
            Config::set('mail.mailers.smtp.password', $this->senderPassword);
        }

        Config::set('mail.from.address', $this->senderEmail);
        Config::set('mail.from.name', $this->senderName ?? explode('@', $this->senderEmail)[0]);

        $mailable = (new WebmailOutgoingEmail($this->body ?? '', $this->isHtml, $this->attachments))
            ->subject($this->subject ?? '(No Subject)');

        $mail = Mail::to($this->to);

        if (! empty($this->cc)) {
            $mail->cc($this->cc);
        }

        if (! empty($this->bcc)) {
            $mail->bcc($this->bcc);
        }

        $mail->send($mailable);

        // After successful send: remove draft from Drafts and copy to Sent via IMAP
        $client = Client::make([
            'host' => config('imap.accounts.default.host'),
            'port' => config('imap.accounts.default.port'),
            'encryption' => config('imap.accounts.default.encryption'),
            'validate_cert' => config('imap.accounts.default.validate_cert'),
            'username' => explode('@', $this->senderEmail)[0],
            'password' => $this->senderPassword,
            'protocol' => 'imap',
        ]);
        $client->connect();

        $service = new DraftService($client);

        if ($this->draftUid !== null) {
            $service->deleteDraft($this->draftUid);
        }

        $service->appendToSent(
            fromEmail: $this->senderEmail,
            to: $this->to,
            cc: $this->cc,
            bcc: $this->bcc,
            subject: $this->subject,
            body: $this->body,
            isHtml: $this->isHtml,
            attachments: $this->attachments,
        );
    }
}
