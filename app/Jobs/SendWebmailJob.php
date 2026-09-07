<?php

namespace App\Jobs;

use App\Mail\WebmailOutgoingEmail;
use App\Models\Draft;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Config;

class SendWebmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $draftId;
    public $senderEmail;
    public $senderPassword;

    /**
     * Create a new job instance.
     */
    public function __construct($draftId, $senderEmail, $senderPassword = null)
    {
        $this->draftId = $draftId;
        $this->senderEmail = $senderEmail;
        $this->senderPassword = $senderPassword;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $draft = Draft::find($this->draftId);

        if (!$draft) {
            return;
        }

        // Configure mailer dynamically for the specific user
        // This ensures the email is sent authenticating as the actual user
        if ($this->senderPassword) {
            Config::set('mail.mailers.smtp.username', $this->senderEmail);
            Config::set('mail.mailers.smtp.password', $this->senderPassword);
        }
        
        Config::set('mail.from.address', $this->senderEmail);
        Config::set('mail.from.name', explode('@', $this->senderEmail)[0]);

        $mailable = (new WebmailOutgoingEmail($draft->body, $draft->is_html))
                        ->subject($draft->subject ?? '(No Subject)');

        $mail = Mail::to($draft->to);

        if (!empty($draft->cc)) {
            $mail->cc($draft->cc);
        }

        if (!empty($draft->bcc)) {
            $mail->bcc($draft->bcc);
        }

        $mail->send($mailable);

        // TODO: Move draft to a "Sent" folder via IMAP append before deleting
        $draft->delete();
    }
}
