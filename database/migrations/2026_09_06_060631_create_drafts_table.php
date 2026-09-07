<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('drafts', function (Blueprint $table) {
            $table->id();
            // Assuming Drafts belong to a MailUser.
            // In a real scenario with Webklex, you might authenticate the mail user via IMAP and store their email here.
            $table->string('user_email');
            $table->string('subject')->nullable();
            $table->json('to')->nullable(); // Array of recipients
            $table->json('cc')->nullable();
            $table->json('bcc')->nullable();
            $table->longText('body')->nullable();
            $table->boolean('is_html')->default(true);
            $table->json('attachments')->nullable(); // Store file paths if attached
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('drafts');
    }
};
