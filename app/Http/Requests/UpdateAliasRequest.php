<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAliasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'source' => 'sometimes|email|max:255',
            'destination' => 'sometimes|string',
            'active' => 'boolean',
        ];
    }
}
