<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Domain extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    public function mailUsers(): HasMany
    {
        return $this->hasMany(MailUser::class);
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(Alias::class);
    }
}
