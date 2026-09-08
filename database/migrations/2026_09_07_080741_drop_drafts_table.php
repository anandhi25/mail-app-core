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
        Schema::dropIfExists('drafts');
    }

    public function down(): void
    {
        Schema::create('drafts', function (Blueprint $table) {
            $table->id();
            $table->string('user_email');
            $table->string('subject')->nullable();
            $table->json('to')->nullable();
            $table->json('cc')->nullable();
            $table->json('bcc')->nullable();
            $table->longText('body')->nullable();
            $table->boolean('is_html')->default(true);
            $table->json('attachments')->nullable();
            $table->timestamps();
        });
    }
};
