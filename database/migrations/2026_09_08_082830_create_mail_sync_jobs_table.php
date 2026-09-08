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
        Schema::create('mail_sync_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mail_user_id')->constrained()->cascadeOnDelete();

            // Source IMAP Credentials
            $table->string('source_host');
            $table->integer('source_port')->default(993);
            $table->string('source_encryption')->default('ssl');
            $table->string('source_username');
            $table->text('source_password'); // encrypted

            // Stats
            $table->string('status')->default('pending'); // pending, processing, completed, failed
            $table->integer('total_messages')->default(0);
            $table->integer('synced_messages')->default(0);
            $table->text('error_log')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mail_sync_jobs');
    }
};
