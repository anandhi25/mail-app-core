<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMailUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => 'sometimes|email|max:255|unique:mail_users,email,' . $this->route('user')->id,
            'password' => 'sometimes|string|min:8',
            'quota_bytes' => 'nullable|integer|min:0',
            'active' => 'boolean',
        ];
    }
}
