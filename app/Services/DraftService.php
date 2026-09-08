<?php

namespace App\Services;

use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Webklex\PHPIMAP\Client;

class DraftService
{
    public function __construct(private readonly Client $client) {}

    /**
     * Append a new draft to the IMAP Drafts folder.
     * Returns the UID of the newly appended message.
     */
    public function saveDraft(
        string $fromEmail,
        array $to = [],
        array $cc = [],
        array $bcc = [],
        ?string $subject = null,
        ?string $body = null,
        bool $isHtml = true,
        array $attachments = []
    ): int {
        $rfc822 = $this->buildRfc822($fromEmail, $to, $cc, $bcc, $subject, $body, $isHtml, $attachments);
        $folder = $this->client->getFolder('Drafts');
        $responses = $folder->appendMessage($rfc822, ['\\Draft', '\\Seen'], null);

        return $this->parseAppendUid($responses);
    }

    /**
     * Replace an existing draft: delete old UID, append updated version.
     * Returns the new UID.
     */
    public function updateDraft(
        int $uid,
        string $fromEmail,
        array $to = [],
        array $cc = [],
        array $bcc = [],
        ?string $subject = null,
        ?string $body = null,
        bool $isHtml = true,
        array $attachments = []
    ): int {
        $this->deleteDraft($uid);

        return $this->saveDraft($fromEmail, $to, $cc, $bcc, $subject, $body, $isHtml, $attachments);
    }

    /**
     * List all messages in the Drafts folder.
     */
    public function listDrafts(): array
    {
        $folder = $this->client->getFolder('Drafts');
        $messages = $folder->messages()->all()->get();

        $drafts = [];
        foreach ($messages as $message) {
            $drafts[] = [
                'uid' => $message->getUid(),
                'subject' => $message->getSubject()[0] ?? '(No Subject)',
                'to' => array_map(fn ($a) => $a->mail, $message->getTo()->toArray()),
                'date' => $message->getDate()[0]?->format('Y-m-d H:i:s'),
            ];
        }

        return $drafts;
    }

    /**
     * Permanently delete a draft by UID.
     */
    public function deleteDraft(int $uid): void
    {
        $folder = $this->client->getFolder('Drafts');
        $message = $folder->query()->getMessageByUid($uid);

        if ($message) {
            $message->delete(true);
        }
    }

    /**
     * Append a sent copy to the Sent folder after successful SMTP delivery.
     */
    public function appendToSent(
        string $fromEmail,
        array $to = [],
        array $cc = [],
        array $bcc = [],
        ?string $subject = null,
        ?string $body = null,
        bool $isHtml = true,
        array $attachments = []
    ): void {
        $rfc822 = $this->buildRfc822($fromEmail, $to, $cc, $bcc, $subject, $body, $isHtml, $attachments);
        $folder = $this->client->getFolder('Sent');
        $folder->appendMessage($rfc822, ['\\Seen'], null);
    }

    private function buildRfc822(
        string $fromEmail,
        array $to,
        array $cc,
        array $bcc,
        ?string $subject,
        ?string $body,
        bool $isHtml,
        array $attachments
    ): string {
        $email = (new Email)
            ->from(new Address($fromEmail, explode('@', $fromEmail)[0]))
            ->subject($subject ?? '(No Subject)');

        if (! empty($to)) {
            $email->to(...$to);
        }
        if (! empty($cc)) {
            $email->cc(...$cc);
        }
        if (! empty($bcc)) {
            $email->bcc(...$bcc);
        }

        if ($isHtml) {
            $email->html($body ?? '');
        } else {
            $email->text($body ?? '');
        }

        foreach ($attachments as $file) {
            if (! empty($file['content']) && ! empty($file['filename'])) {
                $decoded = base64_decode(preg_replace('#^data:[\w/\-]+;base64,#i', '', $file['content']));
                $email->attach($decoded, $file['filename'], $file['mime_type'] ?? 'application/octet-stream');
            }
        }

        return $email->toString();
    }

    /**
     * Extract UID from IMAP APPENDUID server response.
     * Format: "OK [APPENDUID <uidvalidity> <uid>] ..."
     */
    private function parseAppendUid(array $responses): int
    {
        foreach ($responses as $response) {
            if (preg_match('/\[APPENDUID \d+ (\d+)\]/i', $response, $matches)) {
                return (int) $matches[1];
            }
        }

        return 0;
    }
}
