<?php

namespace App\Providers;

use App\Auth\DovecotUserProvider;
use App\Models\MailUser;
use Illuminate\Support\Facades\Auth;
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
    }
}
