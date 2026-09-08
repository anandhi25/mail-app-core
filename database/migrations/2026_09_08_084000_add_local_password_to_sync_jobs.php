<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mail_sync_jobs', function (Blueprint $table) {
            $table->text('local_password')->nullable()->after('source_password');
        });
    }

    public function down(): void
    {
        Schema::table('mail_sync_jobs', function (Blueprint $table) {
            $table->dropColumn('local_password');
        });
    }
};
