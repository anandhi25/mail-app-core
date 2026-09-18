<?php

namespace Database\Seeders;

use App\Models\Domain;
use App\Models\MailUser;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Default API Administrator
        User::factory()->create([
            'name' => 'Admin Administrator',
            'email' => 'admin@als.co.id',
            'password' => bcrypt('password123'), // Default password
        ]);

        // Domain — gunakan domain email, bukan subdomain webmail (mail.devbit.biz.id adalah subdomain untuk akses frontend)
        $domain = Domain::create([
            'name' => 'als.co.id',
            'active' => true,
        ]);

        // Mail user
        MailUser::create([
            'domain_id' => $domain->id,
            'email' => 'it.alsholdings@als.co.id',
            'password' => 'surabaya1234', // This will be automatically hashed by the mutator
            'active' => true,
        ]);
    }
}
