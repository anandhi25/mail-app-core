<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreMailUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => 'required|email|unique:mail_users,email|max:255',
            'password' => 'required|string|min:8',
            'quota_bytes' => 'nullable|integer|min:0',
            'active' => 'boolean',
        ];
    }
}
