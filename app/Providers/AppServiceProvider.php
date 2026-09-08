<?php

namespace App\Providers;

use App\Auth\DovecotUserProvider;
use App\Models\MailUser;
use App\Models\ServerConfig;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /**
         * Register custom auth provider untuk MailUser yang passwordnya
         * disimpan dalam format SHA512-CRYPT ($6$...) agar kompatibel dengan Dovecot.
         */
        Auth::provider('dovecot', function ($app, array $config) {
            return new DovecotUserProvider(
                $app['hash'],
                $config['model'] ?? MailUser::class
            );
        });

        // Load Dynamic Server Settings from Database
        $this->loadServerConfigs();
    }

    private function loadServerConfigs(): void
    {
        try {
            // Gunakan db connection binding bawaan Laravel untuk mengecek table
            // Ini aman meskipun dijalankan via artisan queue:work
            if (Schema::hasTable('server_configs')) {
                $configs = ServerConfig::pluck('value', 'key');

                // IMAP Config overrides
                if ($configs->has('imap_host') && ! empty($configs['imap_host']) && $configs['imap_host'] !== 'null') {
                    Config::set('imap.accounts.default.host', $configs['imap_host']);
                }
                if ($configs->has('imap_port') && ! empty($configs['imap_port']) && $configs['imap_port'] !== 'null') {
                    Config::set('imap.accounts.default.port', (int) $configs['imap_port']);
                }
                if ($configs->has('imap_encryption') && ! empty($configs['imap_encryption']) && $configs['imap_encryption'] !== 'null') {
                    $enc = $configs['imap_encryption'] === 'false' ? false : $configs['imap_encryption'];
                    Config::set('imap.accounts.default.encryption', $enc);
                }

                // SMTP Local Config overrides
                if ($configs->has('smtp_host') && ! empty($configs['smtp_host']) && $configs['smtp_host'] !== 'null') {
                    Config::set('mail.mailers.smtp.host', $configs['smtp_host']);
                }
                if ($configs->has('smtp_port') && ! empty($configs['smtp_port']) && $configs['smtp_port'] !== 'null') {
                    Config::set('mail.mailers.smtp.port', (int) $configs['smtp_port']);
                }
                if ($configs->has('smtp_encryption') && ! empty($configs['smtp_encryption']) && $configs['smtp_encryption'] !== 'null') {
                    $enc = $configs['smtp_encryption'] === 'none' ? null : $configs['smtp_encryption'];
                    Config::set('mail.mailers.smtp.encryption', $enc);
                }

                // SMTP Relay / SmartHost Config overrides
                if ($configs->has('relay_auth') && $configs['relay_auth'] === 'true') {
                    if ($configs->has('relay_host') && ! empty($configs['relay_host'])) {
                        Config::set('mail.mailers.smtp.host', $configs['relay_host']);
                    }
                    if ($configs->has('relay_port') && ! empty($configs['relay_port'])) {
                        Config::set('mail.mailers.smtp.port', (int) $configs['relay_port']);
                    }

                    Config::set('mail.relay_enabled', true);
                    Config::set('mail.relay_username', $configs['relay_username'] ?? '');
                    Config::set('mail.relay_password', $configs['relay_password'] ?? '');
                } else {
                    Config::set('mail.relay_enabled', false);
                }
            }
        } catch (\Exception $e) {
            // Jangan crash kalau DB sedang bermasalah (contoh: migrate fresh)
        }
    }
}
