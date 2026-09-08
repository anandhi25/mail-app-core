<?php

use App\Http\Controllers\Api\AliasController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DomainController;
use App\Http\Controllers\Api\MailUserController;
use App\Http\Controllers\Api\ServerConfigController;
use App\Http\Controllers\Api\Webmail\ImapController;
use App\Http\Controllers\Api\Webmail\NotificationStreamController;
use App\Http\Controllers\Api\Webmail\SmtpController;
use App\Http\Controllers\Api\Webmail\WebmailAuthController;
use App\Http\Controllers\Api\Webmail\WebmailProfileController;
use App\Http\Middleware\AuthenticateMailUser;
use App\Http\Middleware\AuthenticateSseToken;
use Illuminate\Support\Facades\Route;

// --- Administrator API ---
Route::prefix('v1/admin')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);

        // Domains
        Route::apiResource('domains', DomainController::class);

        // Mail Users (nested under domains for creation/listing)
        Route::apiResource('domains.users', MailUserController::class)->shallow();
        Route::post('/users/{user}/sync', [MailUserController::class, 'triggerSync']);

        // Aliases (nested under domains for creation/listing)
        Route::apiResource('domains.aliases', AliasController::class)->shallow();

        // Server Configuration
        Route::get('/config', [ServerConfigController::class, 'index']);
        Route::put('/config', [ServerConfigController::class, 'update']);
    });
});

// --- Webmail API (For Mail Users) ---
Route::prefix('v1/webmail')->group(function () {
    Route::post('/login', [WebmailAuthController::class, 'login']);

    Route::middleware(AuthenticateMailUser::class)->group(function () {
        Route::post('/logout', [WebmailAuthController::class, 'logout']);

        // Profile
        Route::get('/profile', [WebmailProfileController::class, 'show']);
        Route::put('/profile', [WebmailProfileController::class, 'update']);

        // IMAP / Inbox
        Route::get('/folders', [ImapController::class, 'getFolders']);
        Route::get('/messages', [ImapController::class, 'getMessages']);
        Route::delete('/messages', [ImapController::class, 'bulkDelete']);
        Route::get('/messages/{uid}', [ImapController::class, 'getMessageDetail']);
        Route::delete('/messages/{uid}', [ImapController::class, 'deleteMessage']);
        Route::post('/messages/{uid}/move', [ImapController::class, 'moveMessage']);

        // SMTP / Drafts / Send
        Route::get('/drafts', [SmtpController::class, 'getDrafts']);
        Route::post('/drafts', [SmtpController::class, 'saveDraft']);
        Route::delete('/drafts/{id}', [SmtpController::class, 'deleteDraft']);
        Route::post('/send', [SmtpController::class, 'sendEmail']);
    });

    // Realtime notifications via Server-Sent Events.
    // Token dikirim via query param karena EventSource tidak support header,
    // lalu diinjeksi ke Bearer oleh AuthenticateSseToken sebelum AuthenticateMailUser.
    Route::get('/notifications/stream', NotificationStreamController::class)
        ->middleware([AuthenticateSseToken::class, AuthenticateMailUser::class]);
});
