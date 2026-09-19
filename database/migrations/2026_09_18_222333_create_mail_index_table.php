<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mail_index', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('mail_user_id')->index();
            $table->string('uid');                      // IMAP UID
            $table->string('folder', 128)->default('INBOX');
            $table->string('message_id', 512)->nullable(); // RFC Message-ID header
            $table->string('subject', 512)->nullable();
            $table->string('from_address', 255)->nullable();
            $table->string('from_name', 255)->nullable();
            $table->text('to_addresses')->nullable();   // JSON array
            $table->longText('body_text')->nullable();  // Plain-text body for search
            $table->boolean('is_seen')->default(false);
            $table->boolean('has_attachment')->default(false);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['mail_user_id', 'folder', 'uid']);
            $table->index(['mail_user_id', 'folder', 'is_seen']);
            $table->index(['mail_user_id', 'sent_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mail_index');
    }
};
