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
        Schema::table('mail_users', function (Blueprint $table) {
            $table->string('name')->nullable()->after('email');

            // Cloud storage credentials (JSON)
            $table->json('dropbox_credentials')->nullable()->after('active');
            $table->json('google_drive_credentials')->nullable()->after('dropbox_credentials');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mail_users', function (Blueprint $table) {
            $table->dropColumn(['name', 'dropbox_credentials', 'google_drive_credentials']);
        });
    }
};
